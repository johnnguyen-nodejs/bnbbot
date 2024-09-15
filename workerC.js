import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import fs from 'fs'
import Queue from 'bull'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const myQueue = new Queue('equal', {
    redis: { host: '127.0.0.1', port: 6379 }
})

class Equal {
    constructor() {
        this.bId = null
        this.a = 0
        this.price = 0
        this.start = false
        this.side = 'BUY'
        this.b = 0
        this.mark = new Map()
        this.event()
        this.reOrder()
    }
    
    async order(quantity, price, side) {
        try {
            this.a = 0
            const order = await client.marginOrder({
                symbol: 'BTCFDUSD',
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price
            });
            return order;
        } catch (error) {
            console.log('C', error.message)
            if(error.message == 'Account has insufficient balance for requested action.'){
                this.a = 0
            } else {
                this.a = Number(quantity)
                const now = Date.now()
                const obj = {
                    time: now,
                    type: side,
                    quantity,
                    price,
                    stt: 'ERROR'
                }
                parentPort.postMessage(obj)
                // this.balanceSttDb.put(now, obj)               
            }
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
    async reOrder(){
        setInterval(async () => {
            if(this.bId){
                await this.cancel(this.bId)
            }
            if(this.a > this.b*1.5) {
                await this.order(this.a.fix(5), this.price.toFixed(2), this.side)
            }
        }, 100)
    }

    event() {
        client.ws.marginUser(async msg => {
            if(msg.eventType == 'executionReport' && Number(msg.quantity) > this.b*1.5) {
                if(msg.orderStatus == 'NEW') {
                    this.bId = msg.orderId
                    this.a = Number(msg.quantity)
                }
                if(msg.orderStatus == 'FILLED') {
                    this.bId = null
                    this.a = 0
                    const obj = {
                        time: msg.eventTime,
                        type: msg.side,
                        quantity: msg.quantity,
                        price: msg.price,
                        stt: 'FILLED'
                    }
                    parentPort.postMessage(obj)
                }
                if(msg.orderStatus == 'CANCELLED') {
                    this.bId = null
                    if(Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity) < this.b*1.5) {
                        this.a = 0
                    } else {
                        this.a -= Number(totalQuoteTradeQuantity)/Number(msg.price)
                    }
                    const obj = {
                        time: msg.eventTime,
                        type: msg.side,
                        quantity: Number(msg.quantity) - Number(msg.totalQuoteTradeQuantity)/Number(msg.price),
                        price: msg.price,
                        stt: 'ERROR'
                    }
                    parentPort.postMessage(obj)                
                }
            }
        })
    }

    run(){
        parentPort.on('message', (message) => {
            const { type, a, p, f, time} = message
            this.price = p
            this.b = f
            if(Number(a) > this.b*1.5 && this.a == 0 && !this.start) {
                this.start = true
                this.side = type
                myQueue.add({ a, p, type, time})
                setTimeout(() =>{
                    this.start = false
                }, 2000)
            }
        })

        myQueue.process(1, async job => {
            const { a, p, type, time } = job.data
            if(!this.mark.has(Math.floor(time/1000))){
                this.mark.set(Math.floor(time/1000), true)
                this.order(a.fix(5), p.toFixed(2), type)
            }
        })
    }
}

const equal = new Equal()
equal.run()




