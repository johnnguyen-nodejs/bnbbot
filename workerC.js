import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import fs from 'fs'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Buy {
    constructor() {
        this.bId = null
        this.a = 0
        this.price = 0
        this.side = 'BUY'
        this.f = 'equal.txt'
        this.event()
        this.reOrder()
    }
    
    async order(quantity, price, side) {
        try {
            const order = await client.marginOrder({
                symbol: 'BTCFDUSD',
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price
            });
            return order;
        } catch (error) {
            this.a = Number(quantity)
            console.log('C', error.message)
            const now = new Date()
            fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${quantity} - ${price} - ${side} - error\n`, console.log)
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
            if(this.a > 0.001) {
                await this.order(this.a.fix(5), this.price.toFixed(2), this.side)
            }
        }, 500)
    }

    event() {
        client.ws.marginUser(async msg => {
            if(msg.eventType == 'executionReport' && Number(msg.quantity) > 0.00015) {
                if(msg.orderStatus == 'NEW') {
                    this.bId = msg.orderId
                    this.a = Number(msg.quantity)
                }
                if(msg.orderStatus == 'FILLED') {
                    this.bId = null
                    this.a = 0
                    parentPort.postMessage({ insufficient: false})
                    const now = new Date()
                    fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${msg.side} - filled\n`, console.log)
                }
                if(msg.orderStatus == 'PARTIALLY_FILLED'){
                    this.a -= Number(msg.lastTradeQuantity)
                    const now = new Date()
                    fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.lastTradeQuantity} - ${msg.price} - ${msg.side} - partially\n`, console.log)
                }
                if(msg.orderStatus == 'CANCELLED') {
                    const now = new Date()
                    fs.appendFile(this.f, `${now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()} - ${msg.quantity} - ${msg.price} - ${msg.side} - error\n`, console.log)
                }
            }
        })
    }

    run(){
        parentPort.on('message', (message) => {
            const { type, a, p} = message
            this.price = p
            if(Number(a) > 0.0001 && !this.start) {
                this.side = type
                console.log("equal", type, a, p)
                this.order(a.fix(5), p.toFixed(2), type)
            }
        })
    }
}

const buy = new Buy()

buy.run()



