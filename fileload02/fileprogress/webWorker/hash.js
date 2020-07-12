self.importScripts('/api/spark-md5.min.js')

self.onmessage = e => {
  const {fileChunkList} = e.data;

  console.log('==****==', fileChunkList)
  // console.log('this==', self)

  const spark = new self.SparkMD5.ArrayBuffer()
  let percentage = 0
  let count = 0;

  const loadNext = index => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(fileChunkList[index].file)
    reader.onload = e => { // 文件完成读取之后
      count++; // 这很明显是一个计数器
      // console.log('*******', e.target.result)
      // 读取文件之后开始加密
      spark.append(e.target.result)
      // 判读这是第几个加密
      if (count === fileChunkList.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end() // 完全加密整个文件后，才进行返回这个文件的Hash
        })
        self.close();
      } else {
        percentage += 100 / fileChunkList.length;
        self.postMessage({
          percentage: percentage
        })
        loadNext(count);
      }
    }
  }
  loadNext(0);
}