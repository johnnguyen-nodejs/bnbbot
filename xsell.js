import * as dotenv from 'dotenv'
dotenv.config()
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import "./prototype.js"
import fs from 'fs'
import Queue from 'bull'
// import { tradeDb } from './db.js'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const myQueue = new Queue('sell', {
    redis: { host: '127.0.0.1', port: 6379 }
})


class Sell {
    constructor() {
        this.sIds = []
        this.mark = new Map()
        this.a  = 0
        this.e = 0
        this.s = 0
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
            // const now = Date.now()
            this.e++
            console.log('sell error', (this.s*100/(this.s + this.e)).toFixed(2))
            // const obj = {
            //     time: now,
            //     type: 'SELL',
            //     quantity,
            //     price,
            //     stt: 'ERROR',
            //     eRate: (this.s*100/(this.s + this.e)).toFixed(2)
            // }
            // tradeDb.put(now, obj)           
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
                    this.cancel(order)
                }
            }
        },100)
    }


    async updateArr(arr, id) {
        const index = arr.findIndex(item => item === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    event(){
        // tradeDb.open()
        client.ws.marginUser(msg => {
            if(msg.eventType == 'executionReport' && msg.side == 'SELL') {
                if(msg.orderStatus == 'NEW') {
                    this.sIds.push(msg.orderId)
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.sIds, msg.orderId)
                    this.s++
                    console.log('sell success', (this.s*100/(this.s + this.e)).toFixed(2))
                    const obj = {
                        time: msg.eventTime,
                        type: 'SELL',
                        quantity: msg.quantity,
                        price: msg.price,
                        stt: 'FILLED',
                        eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    }
                    parentPort.postMessage(obj)
                    // tradeDb.put(msg.eventTime, obj)                  
                 }
                if(msg.orderStatus == 'CANCELED') {
                    this.updateArr(this.sIds, msg.orderId)
                    this.e++
                    console.log('sell error', (this.s*100/(this.s + this.e)).toFixed(2))
                    // const obj = {
                    //     time: msg.eventTime,
                    //     type: 'SELL',
                    //     quantity: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price),
                    //     price: msg.price,
                    //     stt: 'ERROR',
                    //     eRate: (this.s*100/(this.s + this.e)).toFixed(2)
                    // }
                    // tradeDb.put(msg.eventTime, obj)                 
                }
            }
        })
    }

    run(){
        parentPort.on('message',async (message) => {
            const { a, p, time } = message
            if(a > 0 && p > 0) {
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







