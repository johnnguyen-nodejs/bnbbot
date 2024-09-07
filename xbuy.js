import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const symbol = process.env.SYMBOL || 'BTCFDUSD'

class Buy {
    constructor() {
        this.bIds = []
        this.cancelAll()
        this.event()
    }
    
    async order(quantity, price){
        try {
            const order = await client.marginOrder({
                symbol,
                side: 'BUY',
                type: 'LIMIT_MAKER',
                quantity,
                price
            });
            return order;
        } catch (error) {
            console.log('-')
        }
    };

    async cancel(orderId){
        try {
            await client.marginCancelOrder({
                symbol,
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }

    updateArr(arr, id){
        const index = arr.findIndex(item => item.i === id);
        
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    cancelAll(){

        setInterval(async () => {
            if(this.bIds.length > 0){
                for(const order of this.bIds) {
                    this.cancel(order.i)
                }        
            }
        }, 200)
    }
    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'executionReport' && msg.side == 'BUY') {
                if(msg.orderStatus == 'NEW') {
                    this.bIds.push({
                        i: msg.orderId,
                        a: msg.quantity,
                        p: msg.price
                    })
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.bIds, msg.orderId)
                }
                if(msg.orderStatus == 'CANCELED') {
                    this.updateArr(this.bIds, msg.orderId)
                }
            }
        })
    
    }

    run(){
        parentPort.on('message', (message) => {
            const { a, p } = message
            console.log('BUY', a, p)
            this.order(a, p)
        })
    }
}

const buy = new Buy()

buy.run()



