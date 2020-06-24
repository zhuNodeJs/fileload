<template>
  <div class="fileload">
    <input type="file" @change='handleFileChange' />
    <el-button @click='handleUpload'>上传</el-button>
    <div>{{uploadPercentage}}</div>
  </div>
</template>
<script>
 const SIZE = 10000 * 1024; // 切片大小
 export default {
   name: 'FileLoad',
   data() {
     return {
        container: {
          file: null
        },
        data: []
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
    request({
      url,
      method = 'post',
      data,
      headers = {},
      onProgress = e => e,
      requestList
    }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.upload.onprogress = onProgress;
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key])
        })
        xhr.send(data);
        xhr.onload = e => {
          resolve({
            data: e.target.response
          })
        }
      })
    },
    handleFileChange(e) {
      // console.log(e)
      const [file] = e.target.files;
      if (!file) return;
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
    async uploadChuncks() {
      const requestList = this.data
      .map(({chunk, hash, index})=> {
        const formData = new FormData();
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        return {formData, index}
      })
      .map(({formData, index}) => {
        return this.request({
          url: 'http://localhost:3000/',
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
        url: 'http://localhost:3000/merge',
        headers: {
          "content-type": 'application/json'
        },
        data: JSON.stringify({
          filename: this.container.file.name,
          size: SIZE
        })
      })
    },
    async handleUpload () {
      if (!this.container.file) return;
      const _that = this;
      const fileChunkList = _that.createFileChunk(this.container.file)
      this.data = fileChunkList.map(({file}, index) => {
        return {
          chunk: file,
          index, // 初始化索引和进度值
          hash: _that.container.file.name + '-' + index, // 文件名 + 数组下标
          percentage: 0,
          size: file.size
        }
      })

      await _that.uploadChuncks();
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