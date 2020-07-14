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
      chunk += data
    })

    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })

  /**
   * 
   * @param {*} path 单个切片的路径
   * @param {*} writeStream 操作写流
   */
  const pipeStream = (path, writeStream) =>
   new Promise(resolve => {
      const readStream = fse.createReadStream(path);  // 创建读文件的流
      readStream.on("end", () => {
        fse.unlinkSync(path);
        resolve();
      });
      readStream.pipe(writeStream);
    });

    // 合并切片
    // const mergeFileChunk = async(filePath, filename, size) => {
    //   const chunkDir = path.resolve(UPLOAD_DIR, filename)
    //   const OutFile = path.resolve(OUT_DIR, filename)
    //   const chunkPaths = await fse.readdir(chunkDir)
    //   chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
      
    //   fse.writeFileSync(OutFile, '')
    //   chunkPaths.forEach(item => {
    //     fse.appendFileSync(OutFile, fse.readFileSync(path.resolve(chunkDir, item)))
    //     fse.unlinkSync(path.resolve(chunkDir, item))
    //   })
    //   fse.rmdirSync(chunkDir)
    // }
    /**
     * @param {*} filePath 文件的完整的路径和名称
     * @param {*} fileHash 文件的Hash值，文件夹的名称
     * @param {*} size 文件的大小尺寸,传递过来的为固定值
     * @param UPLOAD_DIR target所在的文件名称
     */
    const mergeFileChunk = async (filePath, fileHash, size) => {
      const chunkDir = path.resolve(UPLOAD_DIR, `${fileHash}`)
      const chunkPaths = await fse.readdir(chunkDir) // 读取某个文件夹下的文件, 返回的是 文件名 组成的数组
      // 根据切片下表进行排序
      // 否者直接读取目录的获得的顺序可能会错乱
      chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1]) // 排序，根据文件的索引值，其后面-后面追加的
      console.log(chunkPaths)
      await Promise.all(
        /**
         * chunkPath 单个的文件名，xxxxx-0 
         * 
         */
        chunkPaths.map((chunkPath, index) =>
          pipeStream(
            path.resolve(chunkDir, chunkPath), // 解析文件的完整的路径和名称
            // 指定位置创建可写流
            fse.createWriteStream(filePath, {
              start: index * size,
              end: (index + 1) * size
            })
          )
        )
      )

      fse.rmdirSync(chunkDir); // 合并后删除保存切片的目录
    }

class Controller {
    // 合并切片
    async handleMerge(req, res) {
      const data = await resolvePost(req); // 解析post传过来的数据
      const {filename, size, fileHash} = data // 解析下返回的数据的对象
      const ext = extractExt(filename) // 根据文件名获得文件的扩展名
      const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`) // 解析出文件名和路径
      await mergeFileChunk(filePath, fileHash, size) // 合并文件的切片
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
      const [fileHash] = fields.fileHash;
      const [filename] = fields.filename;

      const filePath = path.resolve(
        UPLOAD_DIR,
        `${fileHash}${extractExt(filename)}`
      )

      /**
       * filePath 
       *   --target--
       *      --文件Hash--
       */

      const chunkDir = path.resolve(UPLOAD_DIR, fileHash)

      // 文件存在直接返回
      if (fse.existsSync(filePath)) {
        res.end('file exist')
        return;
      }

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
  // 判断是否存在/文件是否已上传/已上传切片下标
  async handleVerifyUpload(req, res) {
    const data = await resolvePost(req)
    const {filename, fileHash} = data;
    const ext = extractExt(filename)
    const filePath = path.resolve(UPLOAD_DIR,`${fileHash}${ext}`);
    if (fse.existsSync(filePath)) {
      res.end(
        JSON.stringify({
          shouldUpload: false
        })
      )
    } else {
      res.end(
        JSON.stringify({
          shouldUpload: true,
          uploadedList: await createUploadedList(fileHash)
        })
      )
    }
  }
}

// 返回已经上传切片名
const createUploadedList = async fileHash => {
  return fse.existsSync(path.resolve(UPLOAD_DIR, fileHash))
         ? await fse.readdir(path.resolve(UPLOAD_DIR, fileHash))
         : [];
}

module.exports = Controller