const multiparty = require('multiparty')
const path = require('path')
const fse = require('fs-extra')

const UPLOAD_DIR = path.resolve(__dirname, '..', 'target') // 大文件的存储路径目录
const extractExt = filename => 
  filename.slice(filename.lastIndexOf('.'), filename.length) // 提取后缀名
const OUT_DIR = path.resolve(__dirname, '..', 'dest')

const resolvePost = req => 
  new Promise(resolve => {
    let chunk = ''
    req.on('data', data => {
      chunk += data;
    })

    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })

  const pipeStream = (path, writeStream) =>
   new Promise(resolve => {
      const readStream = fse.createReadStream(path);
      readStream.on("end", () => {
        fse.unlinkSync(path);
        resolve();
      });
      readStream.pipe(writeStream);
    });

  // 合并切片
  const mergeFileChunk = async(filePath, filename, size) => {
    const chunkDir = path.resolve(UPLOAD_DIR, filename)
    const OutFile = path.resolve(OUT_DIR, filename)
    const chunkPaths = await fse.readdir(chunkDir)
    chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
    
    fse.writeFileSync(OutFile, '')
    chunkPaths.forEach(item => {
      fse.appendFileSync(OutFile, fse.readFileSync(path.resolve(chunkDir, item)))
      fse.unlinkSync(path.resolve(chunkDir, item))
    })
    fse.rmdirSync(chunkDir)
}

class Controller {
  // 合并切片
  async handleMerge(req, res) {
    const data = await resolvePost(req);
    const {filename, size} = data;
    const filePath = path.resolve(UPLOAD_DIR, `${filename}`)
    await mergeFileChunk(filePath, filename, size)
    res.end(
      JSON.stringify({
        codo: 0,
        message: 'file merged succes'
      })
    )
  }
  // 处理切片
  async handleFormData(req, res) {
    const multipart = new multiparty.Form();

    multipart.parse(req, async (err, fields, files) => {
      if (err) {
        console.error(err)
        res.status = 500
        res.end('process file chunk failed');
        return;        
      }
      const [chunk] = files.chunk;
      const [hash] = fields.hash;
      const [filename] = fields.filename;
      const chunkDir = path.resolve(UPLOAD_DIR, filename)

      // 切片目录不存在，创建切片目录
      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir)
      }

      // fs-extra 专用方法，类似fs.rename并且跨平台
      // fs-extra 的rename方法类似windows平台会有权限问题
      await fse.move(chunk.path, path.resolve(chunkDir, hash))
      res.end('received file chunk')
    })
    
  
  }
}

module.exports = Controller