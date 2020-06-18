<template>
  <div class="fileload">
    <input type="file" @change='handleFileChange' />
    <el-button @click='handleUpload'>上传</el-button>
  </div>
</template>
<script>
 const SIZE = 10 * 1024 * 1024; // 切片大小
 export default {
   name: 'FileLoad',
   data() {
     return {
        container: {
          file: null,
          data: []
        }
     }
   },
   methods: {
    request({
      url,
      method = 'post',
      data,
      headers = {},
      requestList
    }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
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
      console.log(e)
      const [file] = e.target.files;
      if (!file) return;
      Object.assign(this.$data, this.$options.data())
      console.log('*********', this.$data)

      this.container.file = file;
    },
    // 生产切片
    createFileChunk(file, size = SIZE) {
      const fileChunkList = [];
      let cur = 0;
      while(cur < file.size) {
        fileChunkList.push({file: file.slice(cur, cur+size)})
        cur += size
      }

      return fileChunkList
    },
    // 上传切片
    async uploadChuncks() {
      const requestList = this.data
      .map(({chunk, hash})=> {
        const formData = new FormData();
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        return {formData}
      })
      .map(async ({formData}) => {
        this.request({
          url: 'http://localhost:3000',
          data: formData
        })
      })

      await Promise.all(requestList)
      // 合并切片
      await this.mergeRequest()
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
          hash: _that.container.file.name + '-' + index // 文件名 + 数组下标
        }
      })

      await _that.uploadChuncks();
    }
   }
 }
</script>
<style scoped>
</style>