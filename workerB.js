import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import Queue from 'bull'
import fs from 'fs'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

const myQueue = new Queue('buy', {
    redis: { host: '127.0.0.1', port: 6379 }
})

class Buy {
    constructor() {
        this.bPending = []
        this.bNew = []
        this.mark = new Map()
        this.price = 0
        this.e = 0
        this.s = 0
        this.f = 'buy.txt'
        this.f1 = 'totalbuy.txt'
        this.total = 0
        this.event()
        this.reCancel()
    }
    
    async order(quantity, price) {
        try {
            const order = await client.marginOrder({
                symbol: 'BTCFDUSD',
                side: 'BUY',
                type: 'LIMIT_MAKER',
                quantity,
                price   
            });
            return order;
        } catch (error) {
            console.log('B', error.message)
            parentPort.postMessage({ filled: Number(quantity), usdFilled: Number(quantity)*Number(price)})
            const now = new Date()
            this.e++
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${quantity} - ${price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - error\n`, console.log)

        }
    }

    async cancel(orderId) {

        try {
            await client.marginCancelOrder({
                symbol: 'BTCFDUSD',
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }

    async updateArr(arr, id) {
        const index = arr.findIndex(item => item === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    async reCancel() {
        setInterval(() => {
            if(this.bNew.length > 0) {
                for(const id of this.bNew) {
                    this.cancel(id)
                }
            }
        }, 100);
    }

    event() {
        client.ws.marginUser(async msg => {
            if(msg.eventType == 'executionReport' && msg.side == 'BUY' && Number(msg.quantity) < 0.00015) {
                if(msg.orderStatus == 'NEW') {
                    this.bNew.push(msg.orderId)
                }
                if(msg.orderStatus == 'CANCELED' || msg.orderStatus == 'FILLED') {
                    this.updateArr(this.bNew, msg.orderId)
                    parentPort.postMessage({ filled: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price), usdFilled: Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity)})
                    if(msg.orderStatus == 'CANCELED') {
                        const now = new Date()
                        this.e++
                        fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - error\n`, console.log)
                    } else {
                        this.total += Number(msg.quantity)*Number(msg.price)
                        const now = new Date()
                        this.s++
                        fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - filled\n`, console.log)
                        fs.appendFile(this.f1, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${this.total}\n`, console.log)
                    }
                 }
            }
        })
    }

    run(){
        parentPort.on('message', (message) => {
            const { a, p, time} = message
            this.price = p
            if(a > 0 && p > 0) {
                console.log('buy', a, p, time)
                myQueue.add({ a, p, time})
            }
        })
        myQueue.process(1, async job => {
            const { a, p, time } = job.data
            if(!this.mark.has(Math.floor(time/200)*2)){
                this.mark.set(Math.floor(time/200)*2, true)
                this.order(a.fix(5), p.toFixed(2))
            }
        })
    }
}

const buy = new Buy()

buy.run()



