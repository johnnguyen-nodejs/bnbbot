import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Buy {
    constructor() {
        this.bPending = []
        this.bNew = []
        this.e = 0
        this.s = 0
        this.a = 0
        this.event()
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

    event() {
        client.ws.marginUser(async msg => {
            if(msg.eventType == 'executionReport' && msg.orderType == "LIMIT_MAKER" && msg.side == 'BUY') {
                if(msg.orderStatus == 'NEW') {
                    this.bNew.push(msg.orderId)
                }
                if(msg.orderStatus == 'CANCELED' || msg.orderStatus == 'FILLED') {
                    this.updateArr(this.bNew, msg.orderId)
                }
            }
        })
    }

    run(){
        parentPort.on('message', (message) => {
            const { a, p} = message
            if(a == 0 && p == 0){
                if(this.bNew.length > 0) {
                    for(const id of this.bNew) {
                        this.cancel(id)
                    }
                }
            }
            if(a > 0 && p > 0) {
                console.log('buy', a, p)
                this.order(a.fix(5), p.toFixed(2))
            }
        })
    }
}

const buy = new Buy()

buy.run()




