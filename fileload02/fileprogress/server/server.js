const Controller = require('./controller')
const http = require('http')
const server = http.createServer()
const spark = require('./files/spark-md5.min.js');

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
    }

    if (req.url === '/spark') {
        res.end(spark)
    }

    // if (req.url === '/worker') {

    // }
})

server.listen(3009, () => console.log('正在监听3009端口'))
