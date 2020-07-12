const Controller = require('./controller')
const http = require('http')
const server = http.createServer()

const controller = new Controller()

server.on('request', async(req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') {
        res.status = 200;
        res.end();
        return;
    }

    if (req.url === '/merge') {
        console.log('2')
        await controller.handleMerge(req, res)
        return;
    }

    if (req.url === '/') {
        console.log('1')
        await controller.handleFormData(req, res)
        return;
    }

    if (req.url === '/verify') { // 判断文件是否存在
       await controller.handleVerifyUpload(req, res)
       return;
    }

})

server.listen(3009, () => console.log('正在监听3009端口'))
