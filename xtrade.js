import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Worker } from 'worker_threads'
import { Level } from 'level'
// import { capDb, flashDb, priceDb } from './db.js'
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'


// main()
class Trade {
    constructor(symbol) {
        this.symbol = symbol
        this.db = new Level('db', { valueEncoding: 'json' })
        this.start = 0
        this.buy = true
        this.mark = new Map()
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.btc = 0
        this.bWorker = new Worker('./xbuy.js')
        this.sWorker = new Worker('./xsell.js')
        this.balance()
        this.updateBalance()
        this.event()
    }

    async balance() {
        const accountInfo = await client.marginAccountInfo();
        this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free)
        this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
        this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
        this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
    }

    updateBalance() {
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0].free)
                this.usdA = parseFloat(msg.balances[2].free)
                this.btcL = parseFloat(msg.balances[0].locked)
                this.usdL = parseFloat(msg.balances[2].locked)
                // const obj = {
                //     time: msg.eventTime,
                //     total: this.usdA + this.usdL + (this.btcA + this.btcL)*this.start,
                //     btc: this.btcA + this.btcL,
                //     usd: this.usdA + this.usdL,
                //     price: this.start
                // }
                // capDb.put(msg.eventTime, JSON.stringify(obj))
            }
        })
    }

    event(){
        this.bWorker.on('message', (msg) => {
            this.buy = false
            this.db.put(msg.time, msg)
        })

        this.sWorker.on('message', (msg) => {
            this.buy = true
            this.db.put(msg.time, msg)
        })
    }
    run(){
        client.ws.trades([symbol], async trade => {
            const p = parseFloat(trade.price)
            if(p + 2 < this.start) {
                if(this.buy) {
                    this.btc = (this.usdA/p).fix(5)
                    console.log('--BUY--', this.usdA + this.usdL + (this.btcA + this.btcL)*p, this.btc*p, this.btc, p)
                    if(this.usdA < 5) {
                        this.buy = false
                    } else {
                        this.bWorker.postMessage({ p: p + 0.01, a: this.btc, time: trade.eventTime })
                    }
                    
                    // const obj = {
                    //     time: trade.eventTime,
                    //     type: 'BUY',
                    //     amount: this.btc,
                    //     price: p,
                    //     btc: this.btcA,
                    //     usd: this.usdA
                    // }
                    // flashDb.put(trade.eventTime, obj)
                }

            }
            if(p > this.start + 2) {
                if(!this.buy) {
                    console.log('--SELL--',  this.usdA + this.usdL + (this.btcA + this.btcL)*p, this.btcA*p, this.btcA, p)
                    if(this.usdA > 5){
                        this.buy = true
                    } else {
                        this.sWorker.postMessage({ a: this.btcA, p: p - 0.01, time: trade.eventTime})
                    }
                    // const obj = {
                    //     time: trade.eventTime,
                    //     type: 'SELL',
                    //     amount: this.btc,
                    //     price: p,
                    //     btc: this.btcA,
                    //     usd: this.usdA
                    // }
                    // flashDb.put(trade.eventTime, obj)
                }
            }

            this.start = p
            // priceDb.put(trade.eventTime, p)
        })
    }


}

const trade = new Trade(symbol)

trade.run()

