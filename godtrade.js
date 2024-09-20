import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import { Level } from 'level'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Buy {
    constructor(asset, quote, aLimit, qLimit) {
        this.asset = asset
        this.quote = quote
        this.aLimit = aLimit
        this.qLimit = qLimit
        this.db = new Level('db', {valueEncoding: 'json'})
        this.p = 0
        this.oNew = []
        this.price = 0
        this.btcA = 0
        this.btcL = 0
        this.usdA = 0
        this.usdL = 0
        this.cancelAll()
        this.event()
    }
    
    async order(quantity, price, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.asset + this.quote,
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price
            })
            return order;
        } catch (error) {
            console.log(error.message)
            this.order(quantity, this.price, side)
        }
    }
    async cancel(orderId) {
        try {
            await client.marginCancelOrder({
                symbol: this.asset + this.quote,
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }

    cancelAll(){
        setInterval(() => {
            if(this.oNew.length > 0){
                for(const id of this.oNew){
                    this.cancel(id)
                }
            }
        }, 100);
    }

    async loan(){
        try {
            const amount = await client.marginMaxBorrow({ asset: this.quote})
            await client.marginLoan({
                asset: this.quote,
                amount
            })
            await this.balance()
        } catch (error) {
            console.log("Loan", error.message)
        }
    }

    async updateArr(arr, id) {
        const index = arr.findIndex(item => item === id);
        if (index !== -1) {
            arr.splice(index, 1);
        }
    }

    async balance(){
        try {
            const accountInfo = await client.marginAccountInfo();
            this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.quote)?.free)
            this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.asset)?.free)
            this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.quote)?.locked)
            this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.asset)?.locked)
        } catch (error) {
            console.log('-')
        }
    }

    async event() {
        await this.balance()
        client.ws.marginUser( msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances.find(asset => asset.asset == this.asset).free)
                this.usdA = parseFloat(msg.balances.find(asset => asset.asset == this.quote).free)
                this.btcL = parseFloat(msg.balances.find(asset => asset.asset == this.asset).locked)
                this.usdL = parseFloat(msg.balances.find(asset => asset.asset == this.quote).locked)
            }
            if(msg.eventType == 'executionReport' && msg.orderType == "LIMIT_MAKER") {
                if(msg.orderStatus == 'NEW') {
                    this.oNew.push(msg.orderId)
                    console.log('---1---')
                }
                if(msg.orderStatus == 'CANCELED'){
                    this.updateArr(this.oNew, msg.orderId)
                    if((Number(msg.quantity) - Number(msg.totalTradeQuantity))*this.price > 6){
                        this.order((Number(msg.quantity) - Number(msg.totalTradeQuantity)).fix(this.aLimit), this.price.toFixed(this.qLimit), msg.side)
                    }
                    console.log('---3---')
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.oNew, msg.orderId)
                    this.db.put(msg.eventTime, {
                        time: new Date(msg.eventTime),
                        symbol: msg.symbol,
                        side: msg.side,
                        orgPrice: this.p,
                        price: msg.price,
                        amount: msg.quantity
                    })
                    console.log('---2---')
                }
            }
        })
    }

    run(){
        parentPort.on('message', async (message) => {
            const { type, price} = message
            if(type == 'BUY') {
                if(this.usdA > 6){
                    this.p = price
                    this.order((this.usdA/price).fix(this.aLimit), price.toFixed(this.qLimit), type)
                }
            } 
            if(type == 'SELL') {
                if(this.btcA*price > 6){
                    this.p = price
                    this.order(this.btcA.fix(this.limit), price.toFixed(this.qLimit), type)
                }
            }
            if(type == 'PRICE'){
                this.price = price
            }
        })
    }
}

const buy = new Buy('BTC','FDUSD', 5, 2)

buy.run()




