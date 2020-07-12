<template>
  <div class="fileload">
    <div>
        <input type="file" @change='handleFileChange' />
        <el-button @click='handleUpload'>上传</el-button>
    </div>
    <div>
      <div>计算文件hash</div>
      <el-progress :percentage="hashPercentage"></el-progress>
      <div>总进度</div>
      <el-progress :percentage="fakeUploadPercentage"></el-progress>
    </div>
    <div>
       <el-table :data="data">
          <el-table-column
            prop='hash'
            label="切片hash"
            align="center"
          ></el-table-column>
          <el-table-column label="大小(KB)" align="center" width="120">
            <template v-slot='{row}'>
              {{row.size|transformByte}}
            </template>
          </el-table-column>
          <el-table-column label="进度" align="center">
            <template v-slot='{row}'>
              <el-progress
                :percentage="row.percentage"
                color="#909399"
              >
              </el-progress>
            </template>
          </el-table-column>
       </el-table>
    </div>
  </div>
</template>
<script>
 const SIZE = 10 * 1024 * 1024; // 切片大小

 const Status = {
   wait: 'wait',
   pause: 'pause',
   uploading: 'uploading'
 }
 export default {
   name: 'FileLoad',
   filters: {
     transformByte(val) {
       return Number((val / 1024).toFixed(0));
     }
   },
   data() {     
     return {
        Status,
        container: {
          file: null,
          hash: '',
          worker: null
        },
        data: [],
        hashPercentage: 0,
        requestList: [],
        status: Status.wait,
        // 当暂停时会取消xhr导致进度条后退
        // 为了避免这种情况，需要定义一个假的进度条
        fakeUploadPercentage: 0
     }
   },
   computed: {
      uploadPercentage() {
        if (!this.container.file || !this.data.length) return 0;
        const loaded = this.data
            .map(item => item.size * item.percentage)
            .reduce((acc, cur) => acc + cur)
        console.log(loaded)
        return parseInt((loaded / this.container.file.size).toFixed(2))
      }
   },
   methods: {
    resetData() {
      this.requestList.forEach((xhr, index) => {
        if(xhr.abort) {
          xhr.abort();
        }
      });
      this.requestList = []
      if (this.container.worker) {
        this.container.worker.onmessage = null;
      }
    },
    request({
      url,
      method = 'post',
      data,
      headers = {},
      onProgress = e => e,
      requestList
    }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(method, url)
        xhr.upload.onprogress = onProgress
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key])
        })
        xhr.send(data)
        xhr.onload = e => {
          // 将请求成功的xhr从列表中删除
          if(requestList) {
            const xhrIndex = requestList.findIndex(item => item === xhr)
            requestList.splice(xhrIndex, 1)
          }
          resolve({
            data: e.target.response
          })
        }

        // 暴露当前xhr给外部, 总是把最新的请求对象放入到数组中;
        if (requestList) {
          requestList.push(xhr)
        }
      })
    },
    handleFileChange(e) {
      // console.log(e)
      const [file] = e.target.files;
      if (!file) return;
      this.resetData(); // 将数据重置
      Object.assign(this.$data, this.$options.data())
      // console.log('*********', this.$data)
      this.container.file = file;
    },
    // 生产切片
    createFileChunk(file, size = SIZE) {
      const fileChunkList = [];
      let cur = 0;
      while(cur < file.size) {
        fileChunkList.push({file: file.slice(cur, cur + size)})
        cur += size
      }

      return fileChunkList
    },
    // 上传切片
    async uploadChuncks(uploadedList = []) {
      const requestList = this.data
      .filter(({hash}) => !uploadedList.includes(hash))
      .map(({chunk, hash, index})=> {
        const formData = new FormData();
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        formData.append('fileHash', this.container.hash)
        return {formData, index} // -----
      })
      .map(({formData, index}) => {
        return this.request({
          url: 'http://localhost:3009/',
          data: formData,
          onProgress: this.createProgressHandler(this.data[index])
        }).then(res=> {
          // console.log(res)
          return res;
        })
      })
      
      await Promise.all(requestList); 
      // 合并切片请求
      await this.mergeRequest();
    },
    async mergeRequest() {
      await this.request({
        url: 'http://localhost:3009/merge',
        headers: {
          "content-type": 'application/json'
        },
        data: JSON.stringify({
          filename: this.container.file.name,
          size: SIZE
        })
      })
    },
    calculateHash(fileChunkList) {
      return new Promise((resolve, reject) => {  
        if(window.Worker) {
          this.container.worker = new Worker('/api/hash.js'); // 创建一个worker实例，并赋值到data实现响应式
          this.container.worker.postMessage({fileChunkList})
          this.container.worker.onmessage = e => {
            console.log('>>>>>>', e.data)
            const {percentage, hash} = e.data;
            this.hashPercentage = percentage;
            if (hash) { // 如果hash有值，则表示hash计算完成
              resolve(hash)
            }
          }
        }
      })
    },
    async handleUpload () {
      if (!this.container.file) return; // 点击上传
      this.status = Status.uploading;
      const _that = this;
      const fileChunkList = _that.createFileChunk(this.container.file)
      this.container.hash = await this.calculateHash(fileChunkList)

      const {shouldUpload, uploadedList} = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      );

      if (!shouldUpload) {
        this.$message.success('妙传: 上传成功');
        this.status = Status.wait;
        return;
      }

      this.data = fileChunkList.map(({file}, index) => {
        return {
          fileHash: this.container.hash,
          chunk: file,
          index, // 初始化索引和进度值
          hash: _that.container.hash + '-' + index, // 文件名 + 数组下标
          size: file.size,
          percentage: uploadedList.includes(index) ? 100 : 0
        }
      })

      await _that.uploadChuncks(uploadedList); 
    },
    async verifyUpload(filename, fileHash) {
      const {data} = await this.request({
        url: 'http://localhost:3009/verify',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({
          filename,
          fileHash
        })
      })

      return JSON.parse(data)
    },
    createProgressHandler(item) { // 网络300ms以下的话才会有效果
      return e => {
        item.percentage = parseInt(String(e.loaded / e.total) * 100)
        // console.log('===', item.percentage);
      }
    }
   }
 }
</script>
<style scoped>
</style>