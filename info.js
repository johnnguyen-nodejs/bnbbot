import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import { setTimeout } from 'timers/promises'
import { Level } from 'level'
const db = new Level('db3', { valueEncoding: 'json'})
const main = async () => {
    let k = 0
    for await (const [key, value] of db.iterator()) {
        value.time = new Date(value.time)
        // if(value.time > new Date('2024-09-17T23:41:00') && value.time < new Date('2024-09-18T09:25:00') )
        // {

            console.log(value)
            k++
        // }

        // await setTimeout(200)
    }
    console.log(k)
}
main()


