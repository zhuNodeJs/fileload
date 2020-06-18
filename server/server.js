const http = require('http')
const path = require('path')
const fse = require('fs-extra') 
const multiparty = require('multiparty')

const server = http.createServer();

const UPLOAD_DIR = path.resolve(__dirname, '..', 'target') // 大文件存储位置目录
const DEST_DIR = path.resolve(__dirname, '..', 'dest') // 存放生成的目标的地址

// async function createFile(name) {
//   await fse.writeFile(`${name}` , "")
// }

// createFile(path.resolve('e:\vueEx\vue-fileupload\fileload\target/main.jpg'));

const resolvePost = req => {
  return new Promise((resolve) => {
    let chunk = '';
    req.on('data', data => {
      chunk += data;
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })
}

const pipeStream = (path, writeStream) =>
  new Promise(resolve => {
    const readStream = fse.createReadStream(path)
    readStream.on('end', () => {
      fse.unlinkSync(path)
      resolve()
    })
    readStream.pipe(writeStream)
  })


// 合并切片
const mergeFileChunk = async (filePath, filename, size) => {
  const chunkDir = path.resolve(UPLOAD_DIR, filename)
  const chunkPaths = await fse.readdir(chunkDir)
  chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1])
  await Promise.all(
    chunkPaths.map((chunkPath, index) => 
      pipeStream(
        path.resolve(chunkDir, chunkPath),
        // 指定位置创建可读流
        fse.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size
        })
      )
    )
  )
  fse.rmdirSync(chunkDir); // 合并后删除保存切片的目录
}

server.on('request', async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.status = 200;
    res.end();
    return;
  }

  const multipart = new multiparty.Form();

  multipart.parse(req, async (err, fields, files) => {
    if (err) {
      return;
    }
    
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [filename] = fields.filename;

    const chunkDir = path.resolve(UPLOAD_DIR, filename)

    // 切片目录不存在时，创建切片目录
    if (!fse.existsSync(chunkDir))  {
      await fse.mkdirs(chunkDir)
    }

    // fs-extra专用方法，类似fs.rename并且跨平台
    // fs-extra的rename方法window平台会有权限问题
    await fse.move(chunk.path, `${chunkDir}/${hash}`)
    res.end('received file chunk');  
  })

  if ( req.url=== '/merge') {
    const data = await resolvePost(req)
    console.log('****',data)
    const {filename, size} = data
    const filePath = path.resolve(UPLOAD_DIR, `${filename}`)
    await mergeFileChunk(filePath, filename, size)
    res.end(
      JSON.stringfy({
        code: 0,
        message: 'file merged success'
      })
    )

  }



})



server.listen(3000, () => {
  console.log('正在 3000 端口运行')
})
