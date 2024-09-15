import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import Queue from 'bull'
// import { tradeDb } from './db.js'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

const myQueue = new Queue('buy', {
    redis: { host: '127.0.0.1', port: 6379 }
})

class Buy {
    constructor() {
        this.bNew = []
        this.mark = new Map()
        this.e = 0
        this.s = 0
        this.a = 0
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
            const now = Date.now()
            this.e++
            console.log('buy error', (this.s*100/(this.s + this.e)).toFixed(2))
            // const obj = {
            //     time: now,
            //     type: 'BUY',
            //     quantity,
            //     price,
            //     stt: 'ERROR',
            //     eRate: (this.s*100/(this.s + this.e)).toFixed(2)
            // }
            // tradeDb.put(now, obj)
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
        // tradeDb.open()
        client.ws.marginUser(async msg => {
            if(msg.eventType == 'executionReport' && msg.side == 'BUY') {
                if(msg.orderStatus == 'NEW') {
                    this.bNew.push(msg.orderId)
                }
                if(msg.orderStatus == 'CANCELED') {
                    this.updateArr(this.bNew, msg.orderId)
                    this.e++
                    console.log('buy error', (this.s*100/(this.s + this.e)).toFixed(2))
                    // const obj = {
                    //     time: msg.eventTime,
                    //     type: 'BUY',
                    //     quantity: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price),
                    //     price: msg.price,
                    //     stt: 'ERROR',
                    //     eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    // }
                    // tradeDb.put(msg.eventTime, obj)
                }
                    
                if(msg.orderStatus == 'FILLED'){
                    this.updateArr(this.bNew, msg.orderId)
                    this.s++
                    console.log('buy success', (this.s*100/(this.s + this.e)).toFixed(2))
                    const obj = {
                        time: msg.eventTime,
                        type: 'BUY',
                        quantity: msg.quantity,
                        price: msg.price,
                        stt: 'FILLED',
                        eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    }
                    parentPort.postMessage(obj)
                    // tradeDb.put(msg.eventTime, obj)                
                }
            }
        })
    }

    run(){
        parentPort.on('message', (message) => {
            const { a, p, time} = message
            if(a > 0 && p > 0) {
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

