import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { Bot } from "grammy";
import cron from 'node-cron'
const token = '6769487064:AAHeb54TXaQ63HrPMMH3j84uk_TAST2wb6M' //tk2
const token1 = '6740206795:AAFfhupwx6YNt8i5CuTelPu-qdIrT5m6fHM' //tk1
const bot = new Bot(token);


const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
let btcAmount = 0
let usdAmount = 0
let btcLocked = 0
let usdLocked = 0
let price = 0

const getBalance = async () => {
    try {
        const accountInfo = await client.marginAccountInfo();
        usdAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').free);
        usdLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD').locked)
        btcAmount = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').free)
        btcLocked = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC').locked)
        return
    } catch (error) {
        throw new Error(error)
    }
};
let min = 10570
let max = 10600
const main = async () => {
    try {
        
        getBalance()
        let total = usdAmount + usdLocked + (btcAmount + btcLocked)* price
        console.log( `${usdAmount}-${usdLocked}-${btcLocked}-${btcAmount}-${price}-${total}`)
        // await bot.api.sendMessage(1628930989, `${usdAmount}-${usdLocked}-${btcLocked}-${btcAmount}-${price}-${total}`)
        client.ws.trades([symbol], async trade => {
            try {
                price = parseFloat(trade.price)
            } catch (error) {
                console.log(error)
            }
        })
        
    } catch (error) {
        console.log(error)
    }
}

bot.command("change", ctx => {
    const [mn, mx] = ctx.match.split('-')
    min = parseFloat(mn)
    max = parseFloat(mx)
})

bot.start()

cron.schedule('* * * * * *', main, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

