import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { Level } from 'level'
const db = new Level('./db', { valueEncoding: 'json' })
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})

const main = async () => {
    const data = await client.marginAllOrders({ symbol: 'BTCFDUSD', isIsolated: true})
    for(const obj of data){
        await db.put(obj.time, JSON.stringify(obj))
    }
    for await (const [key, value] of db.iterator()) {
        console.log(value)
    }
}
main()


