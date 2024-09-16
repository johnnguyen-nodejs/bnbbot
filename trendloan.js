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
    constructor(symbol) {
        this.symbol = symbol
        this.oNew = []
        this.mkNew = []
        this.price = 0
        this.k = 0
        this.btcA = 0
        this.btcL = 0
        this.usdA = 0
        this.usdL = 0
        this.event()
        this.cancelMk()
    }
    
    async order(quantity, price, stopPrice, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.symbol,
                side,
                type: 'STOP_LOSS_LIMIT',
                quantity,
                price,
                stopPrice
            })
            return order;
        } catch (error) {
            console.log(side, error.message)
            this.order(quantity, price, stopPrice,side)
        }
    }

    async orderMk(quantity, price, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.symbol,
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price,
            })
            return order;
        } catch (error) {
            console.log(side, error.message)
            setTimeout(() => {
                this.orderMk(quantity, this.price.toFixed(5),side)
            }, 100);
        }
    }

    async cancelMk(){
        setInterval(() => {
            if(this.mkNew.length > 0){
                for(const id of this.mkNew){
                    this.cancel(id)
                }
            }
        }, 100);
    }
    async cancel(orderId) {
        try {
            await client.marginCancelOrder({
                symbol: this.symbol,
                orderId
            })
        } catch (error) {
            this.oNew.length = 0
        }
    }

    async loan(){
        try {
            const amount = await client.marginMaxBorrow({ asset: 'FDUSD'})
            await client.marginLoan({
                asset: 'FDUSD',
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
            this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.free)
            this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.free)
            this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.locked)
            this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.locked)
        } catch (error) {
            console.log('-')
        }
    }

    async event() {
        await this.balance()
        client.ws.marginUser( msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0]?.free)
                this.usdA = parseFloat(msg.balances[2]?.free)
                this.btcL = parseFloat(msg.balances[0]?.locked)
                this.usdL = parseFloat(msg.balances[2]?.locked)
            }
            if(msg.eventType == 'executionReport' && msg.orderType == "STOP_LOSS_LIMIT") {
                if(msg.orderStatus == 'NEW') {
                    this.oNew.push(msg.orderId)
                    console.log('---1---')
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.oNew, msg.orderId)
                    this.k++
                    console.log('---2---')
                    setTimeout(() => {
                        if(msg.side == 'BUY'){
                            if(this.btcA*this.price > 6){
                                this.order(this.btcA.fix(5), Number(msg.price).toFixed(2), (Number(msg.price) - 0.01).toFixed(2), 'SELL')
                            }
                        } else {
                            if(this.usdA > 6){
                                this.order((this.usdA/Number(msg.price)).fix(5), Number(msg.price).toFixed(2), (Number(msg.price) - 0.01).toFixed(2), 'BUY')
                            }
                        }
                    }, 50);
                    
                }
            }
            if(msg.eventType == 'executionReport' && msg.orderType == 'LIMIT_MAKER'){
                if(msg.orderStatus == 'NEW') {
                    this.mkNew.push(msg.orderId)
                    console.log('---3---')
                }
                if(msg.orderStatus == 'CANCELED'){
                    this.updateArr(this.mkNew, msg.orderId)
                    if(Number(msg.quantity)*Number(msg.price) - Number(msg.totalQuoteTradeQuantity) > 6){
                        this.orderMk((Number(msg.quantity) - Number(msg.totalTradeQuantity)).fix(5), this.price.toFixed(2), msg.side)
                    }
                }
                if(msg.orderStatus == 'FILLED') {
                    this.updateArr(this.mkNew, msg.orderId)
                }
            }
        })
    }

    run(){
        parentPort.on('message', async (message) => {
            const { type, price, id} = message
            if(type == 'BUY' || type =='SELL') {
                console.log(type, price, id)
                if(id == 2 ){
                    if(this.k > 0 && this.k%2 == 0){
                        console.log('id20')
                        if(type == 'BUY'){
                            if(this.usdA > 6){
                                this.order((this.usdA/this.price).fix(5), this.price.toFixed(2), (this.price + 0.01).toFixed(2), type)
                            } else {
                                if(this.btcA*this.price > 6){
                                    this.orderMk(this.btcA.fix(5), this.price.toFixed(2), 'SELL')
                                }
                            }
                        } else {
                            if(this.btcA*this.price > 6){
                                this.order(this.btcA.fix(5), price.toFixed(2), (price - 0.01).toFixed(2), type)
                            } else {
                                if(this.usdA > 6){
                                    this.orderMk((this.usdA/this.price).fix(5), this.price.toFixed(2), 'BUY')
                                }
                            }
                        }
                    } else {
                        console.log('id21')
                        if(type == 'BUY'){
                            if(this.usdA > 6){
                                this.order((this.usdA/this.price).fix(5), this.price.toFixed(2), (this.price + 0.01).toFixed(2), type)
                            } else {
                                if(this.btcA*this.price > 6){
                                    this.orderMk(this.btcA.fix(5), this.price.toFixed(2), 'SELL')
                                }
                            }
                        } else {
                            if(this.btcA*this.price > 6){
                                this.order(this.btcA.fix(5), price.toFixed(2), (price - 0.01).toFixed(2), type)
                            } else {
                                if(this.usdA > 6){
                                    this.orderMk((this.usdA/this.price).fix(5), this.price.toFixed(2), 'BUY')
                                }
                            }
                        }
                    }
                }
                if(id == 3){
                    if(this.k > 0 && this.k%2 == 0){
                        console.log('id30')
                        if(type == 'BUY'){
                            if(this.usdA > 6){
                                this.order((this.usdA/this.price).fix(5), this.price.toFixed(2), (this.price + 2).toFixed(2), type)
                            } else {
                                if(this.btcA*this.price > 6){
                                    this.orderMk(this.btcA.fix(5), this.price.toFixed(2), 'SELL')
                                }
                            }
                        } else {
                            if(this.btcA*this.price > 6){
                                this.order(this.btcA.fix(5), price.toFixed(2), (price - 0.01).toFixed(2), type)
                            } else {
                                if(this.usdA > 6){
                                    this.orderMk((this.usdA/this.price).fix(5), this.price.toFixed(2), 'BUY')
                                }
                            }
                        }
                    } else {
                        console.log('id31')
                        if(type == 'BUY'){
                            if(this.usdA > 6) {
                                this.order((this.usdA/price).fix(5), price.toFixed(2), (price + 0.01).toFixed(2), type)
                            } else {
                                if(this.btcA*this.price > 6){
                                    this.orderMk(this.btcA.fix(5), this.price.toFixed(2), 'SELL')
                                }
                            }
                        } else {
                            if(this.btcA*this.price > 6){
                                this.order(this.btcA.fix(5), price.toFixed(2), (price - 0.01).toFixed(2), type)
                            } else {
                                if(this.usdA > 6){
                                    this.orderMk((this.usdA/this.price).fix(5), this.price.toFixed(2), 'BUY')
                                }
                            }
                        }
                    }
                }
                this.k = 0
            } 
            if(type == 'PRICE'){
                this.price = price
            }
            if(type == 'CANCEL'){
                if(this.oNew.length > 0){
                    for(const id of this.oNew){
                        this.cancel(id)
                    }
                }
            }
        })
    }
}

const buy = new Buy('BTCFDUSD')

buy.run()




