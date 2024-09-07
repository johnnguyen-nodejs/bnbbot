import * as dotenv from 'dotenv'
dotenv.config()
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import "./prototype.js"
import fs from 'fs'
import Queue from 'bull'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const myQueue = new Queue('sell', {
    redis: { host: '127.0.0.1', port: 6379 }
})


class Sell {
    constructor() {
        this.btcA = 0
        this.price = 0
        this.sIds = []
        this.mark = new Map()
        this.f = 'sell.txt'
        this.f1 = 'totalsell.txt'
        this.e = 0
        this.s = 0
        this.total = 0
        this.reCancel()
        this.event()
    }
    async order(quantity, price){
        try {
            const order = await client.marginOrder({
                symbol: 'BTCFDUSD',
                side: 'SELL',
                type: 'LIMIT_MAKER',
                quantity,
                price
            });
            return order;
        } catch (error) {
            if(error.message == 'Account has insufficient balance for requested action.') {
                parentPort.postMessage({usdFilled: 0, btcFilled: 0} )
            } else {
                parentPort.postMessage({usdFilled: Number(quantity)*Number(price), btcFilled: Number(quantity)} )
            }
            const now = new Date()
            this.e++
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${quantity} - ${price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - error\n`, console.log)
        }
    };
    async cancel(orderId){
        try {
            await client.marginCancelOrder({
                symbol: 'BTCFDUSD',
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }

    reCancel(){
        setInterval(() => {
            if(this.sIds.length >= 1) {
                for(const order of this.sIds) {
                    this.cancel(order.id)
                }
            }
        },1000)
    }

    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
            }
            if(msg.eventType == 'executionReport' && msg.side == 'SELL' && Number(msg.quantity) < 0.00015) {
                if(msg.orderStatus == 'NEW') {
                    this.sIds.push({
                        id: msg.orderId,
                        a: msg.quantity,
                        p: msg.price
                    })
                }
                if(msg.orderStatus == 'FILLED') {
                    this.sIds.length = 0
                    parentPort.postMessage({ usdFilled: Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity), btcFilled: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price) })
                    this.total += Number(msg.quantity)*Number(msg.price)
                    const now = new Date()
                    this.s++
                    fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - filled\n`, console.log)
                    fs.appendFile(this.f1, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${this.total}\n`, console.log)
                }
                if(msg.orderStatus == 'CANCELED') {
                    this.sIds.length = 0
                    parentPort.postMessage({ usdFilled: Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity), btcFilled: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price) })
                    const now = new Date()
                    this.e++
                    fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${(this.s*100/(this.s + this.e)).toFixed(2)} - error\n`, console.log)
                }
            }
        })
    }

    run(){
        parentPort.on('message',async (message) => {
            const { a, p, time } = message
            if(a > 0 && p > 0) {
                console.log('sell', a, p, time)
                myQueue.add({ a, p, time })
            }
        })

        myQueue.process(1, async (job) => {
            const { a, p, time } = job.data
            console.log(a, p, time)
            if(!this.mark.has(Math.floor(time/200)*2)){
                this.mark.set(Math.floor(time/200)*2, true)
                this.order(a.fix(5), p.toFixed(2))
            }
        })
    }
}

const sell = new Sell()
sell.run()






