import { Level } from "level";

export const db = new Level('all12', { valueEncoding: 'json'})
export const db1 = db.sublevel('db1', { valueEncoding: 'json'})
export const db2 = db.sublevel('db2', { valueEncoding: 'json'})
export const db3 = db.sublevel('db3', { valueEncoding: 'json'})
export const db4 = db.sublevel('db4', { valueEncoding: 'json'})
export const db5 = db.sublevel('db5', { valueEncoding: 'json'})
export const db6 = db.sublevel('db6', { valueEncoding: 'json'})