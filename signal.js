import { RSI } from 'technicalindicators'
import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import fs from 'fs'
import { Bot } from "grammy";
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
const bot = new Bot('7345814940:AAHz42cPP5LtBUFlRjp1hRnBuGyGheB7yOc');

class Signal {
    constructor(symbol) {
        this.symbol = symbol
        this.rsi = new RSI({
            values: [],
            period: 120
        })
        this.old = null
        this.mark = new Map()
        this.event()
    }

    event(){
        client.ws.trades([this.symbol], async trade => {
            try {
                const p = parseFloat(trade.price)
                const r = this.rsi.nextValue(p)
                if(r !== undefined) {
                    const date = new Date()
                    if(r >= 80 && r > this.old) {
                        fs.appendFileSync(`${this.symbol}.txt`, `${date.getDate() + '/' + (date.getMonth() + 1) + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()}-${r}-${p}\n`, console.log)
                        const ddd = Math.floor(trade.tradeTime/300000)*300
                        if(!this.mark.has(ddd)){
                            this.mark.set(ddd, true)
                            bot.api.sendMessage('@btradingsig', `Pair: ${this.symbol}\nPrice: ${p}\nPoint: ${r}\nShort Now!`, { parse_mode: 'HTML'})
                        }
                    }
                    if(r <= 5 && r < this.old) {
                        fs.appendFileSync(`${this.symbol}.txt`, `${date.getDate() + '/' + (date.getMonth() + 1) + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()}-${r}-${p}\n`, console.log)
                        const ddd = Math.floor(trade.tradeTime/300000)*300
                        if(!this.mark.has(ddd)){
                            this.mark.set(ddd, true)
                            bot.api.sendMessage('@btradingsig', `Pair: ${this.symbol}\nPrice: ${p}\nPoint: ${r}\nLong Now!`, { parse_mode: 'HTML'})
                        }
                    }
                    this.old = r
                }
            } catch (error) {
                console.log(error)
            }
        })

    }
}

const btc = new Signal('BTCUSDT')
const btc2 = new Signal('BTCFDUSD')
const eth = new Signal('ETHUSDT')
const ltc = new Signal('BNBUSDT')
