import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Bot } from "grammy"
import { Worker } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
const symbol = process.env.SYMBOL || 'BTCFDUSD'
const token = '6199209865:AAGfm7HNh_BErEfy-NRrCIDDca8xdG5w1I0'

class Trade {
    constructor(rate) {
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.canBuy = true
        this.rate = rate
        this.stop = false
        this.handle = new Map()
        this.max = 0
        this.start = 0
        this.k = 0
        this.bWorker = new Worker('./xbuy.js')
        this.sWorker = new Worker('./xsell.js')
        this.getBalance()
        this.event()
        this.resetMax()
    }

    async getBalance(){
        try {
            const accountInfo = await client.marginAccountInfo();
            this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free);
            this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
            this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
            this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
            return
        } catch (error) {
            throw new Error(error)
        }
    }
    event(){
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = Number(msg.balances[0].free)
                this.usdA = Number(msg.balances[2].free)
                this.btcL = Number(msg.balances[0].locked)
                this.usdL = Number(msg.balances[2].locked)
            }
            if(msg.eventType == 'executionReport' && msg.side == 'BUY') {
                if(msg.orderStatus == 'FILLED') {
                    this.sWorker.postMessage({ a: Number(msg.lastTradeQuantity), p: Number(msg.price) + 4 })
                }
                if(msg.orderStatus == 'PARTIALLY_FILLED') {
                    this.sWorker.postMessage({ a: Number(msg.lastTradeQuantity), p: Number(msg.price) + 4 })
                }
            }
        })
    
    }
    resetMax(){
        setInterval(() => {
            if(this.stop) {
                this.stop = false
                this.max = this.start
                console.log('NEW MAX 1: ' + this.max)
            }
        }, 15000)
    }

    async main(){
    
        client.ws.trades([symbol], async trade => {
            try {
                if(Number(trade.price) > this.max) {
                    this.max = Number(trade.price)
                    console.log('NEW MAX: ' + this.max)
                }
                if(Number(trade.price) < this.max - 15) {
                    if(!this.stop) {
                        this.stop = true
                        console.log('LOCKED')
                    }
                } else {
                    if(this.stop) {
                        this.stop = false
                        console.log('OPENED')
                    }
                }
                if( Number(trade.price) + 2 < this.start && this.usdA > 5) {
                    if(!this.handle.get(`${this.k+1}`) && !this.stop && (this.usdA + this.usdL + (this.btcA + this.btcL)*Number(trade.price))*this.rate < this.usdA) {
                        this.bWorker.postMessage({ a: ((this.usdA + this.usdL + (this.btcA + this.btcL)*Number(trade.price))*this.rate/(Number(trade.price) + 0.001)).fix(5), p: (Number(trade.price) + 0.001).fix(2)})
                        this.k++
                    }
                }
                this.start = Number(trade.price)
            } catch (error) {
                throw new Error(error)
            }
        })
    }
}

const trade = new Trade(0.02)

trade.main()

