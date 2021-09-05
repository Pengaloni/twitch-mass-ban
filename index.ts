import * as dotenv from 'dotenv'
const currentDir = __dirname

dotenv.config({
    path: `${currentDir}/.env`
})

import tmi, {Actions, Options} from 'tmi.js'
import fetch from 'node-fetch'
import difference from 'lodash.difference'
import { appendFileSync, existsSync, readFile } from 'fs'
import SETTINGS from './src/shared/settings'
import URLS from './src/shared/urls'
import Arguments from './src/enums/Arguments'
import AuthInterface from './src/interfaces/AuthInterface'
import { promisify } from 'util'

const readFilePromise = promisify(readFile)

class MassBanAndClean {
    private AUTH: AuthInterface
    private arguments = process.argv.slice(SETTINGS.UNUSED_NODE_ARGS)
    private performMassBan: boolean
    private performMassUnBan: boolean
    private bannedList = `${currentDir}/${SETTINGS.BANNED_USERS_LIST}`

    // define tmi.js object until the vendor provides types.
    private client: Actions

    constructor() {
        this.performMassBan = this.isFlagTrue(this.arguments[Arguments.ENABLE_MASS_BAN])
        this.performMassUnBan = this.isFlagTrue(this.arguments[Arguments.ENABLE_MASS_UNBAN])

        this.AUTH = {
            OAUTH_TOKEN: process.env.OAUTH_TOKEN,
            USERNAME: process.env.USERNAME,
            CHANNEL: process.env.CHANNEL,
        }

        const tmiClientOptions: Options = {
            options: { debug: true },
            identity: {
                username: this.AUTH.USERNAME,
                password: this.AUTH.OAUTH_TOKEN,
            },
            channels: [this.AUTH.CHANNEL],
            connection: {
                reconnect: false,
            },
        }

        this.client = new tmi.Client(tmiClientOptions)
    }

    private async hasApiCallOkStatus(status: number): Promise<void> {
        const OK_RESPONSE_STATUS_REGEX = new RegExp('20[01]')

        if (!OK_RESPONSE_STATUS_REGEX.test(status.toString())) {
            this.client.disconnect()
            throw new Error(`Endpoint responded with status: ${status}`)
        }
    }

    private isFlagTrue(arg: string): boolean {
        if (this.isUndefined(arg)) {
            return SETTINGS.DEFAULT_ARG_FLAG
        }

        return arg.toLowerCase() === 'true'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isUndefined(variable: any): boolean {
        return typeof variable === 'undefined'
    }

    private isEmpty(str: string): boolean {
        return !str.length
    }

    private isCredentialInvalid(credential: string | undefined): boolean {
        return this.isUndefined(credential) || this.isEmpty(credential)
    }

    private sleep(time: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, time))
    }

    private async banFromList(): Promise<void> {
        console.log('Acquiring list...')

        const listResponse = await fetch(URLS.LIST)
        
        await this.hasApiCallOkStatus(listResponse.status)

        const fetchedList = await listResponse.text()

        console.log('Ban list acquired!')

        const bannedBuffer = await readFilePromise(this.bannedList, 'utf-8')

        
        const banned = bannedBuffer.split(SETTINGS.SEPARATOR)
        const fetched = fetchedList.split(SETTINGS.SEPARATOR)
        const toBan = difference(fetched, banned)
        const toBanLength = toBan.length

        console.log(`Banning ${toBanLength} users...`)

        for (const name of toBan) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/ban ${name} Known bot`).then(() => {
                appendFileSync(this.bannedList, `${SETTINGS.SEPARATOR}${name}`, 'utf8')
            })
            .catch(e => {
                this.client.disconnect()
                throw new Error(e)
            })
        }
    }

    private async unBanFalsePositives(): Promise<void> {
        console.log('Acquiring false positives list...')

        const listResponse = await fetch(URLS.LIST_FALSE_POSITIVES)

        await this.hasApiCallOkStatus(listResponse.status)

        const fetchedList = await listResponse.text()

        console.log('List of false positives acquired!')
        
        const unBanList = fetchedList
            .split('\n')
            .filter((name: string) => name)
        const unBanListLength = unBanList.length

        console.log(`Unbanning ${unBanListLength} users...`)

        for (const name of unBanList) {
            await this.sleep(SETTINGS.TIMEOUT_BUFFER)
            await this.client.say(this.AUTH.CHANNEL, `/unban ${name}`)
            .catch(e => {
                this.client.disconnect()
                throw new Error(e)
            })
        }
    }

    public async init(): Promise<void> {
        // if could not connect
        if (this.isUndefined(this.client)) {
            throw new Error('Error while connecting!')
        }

        // if .env file does not exist, exit
        if (!existsSync(`${currentDir}/.env`)) {
            throw new Error(`No .env file found in ${currentDir}`)
        }

        // if credentials are empty, exit
        if (this.isCredentialInvalid(this.AUTH.OAUTH_TOKEN) || this.isCredentialInvalid(this.AUTH.USERNAME) || this.isCredentialInvalid(this.AUTH.CHANNEL)) {
            throw new Error('Invalid credentials in .env file!')
        }

        console.info('Connecting to Twitch...')
        console.info(`Connecting to #${this.AUTH.CHANNEL} with user ${this.AUTH.USERNAME}`)

        try {
            await this.client.connect()
        }
        catch {
            throw new Error('You got rate limited!')
        }

        console.info('Connected!')

        if (this.performMassBan) {
            await this.banFromList()
        }

        if (this.performMassUnBan) {
            await this.unBanFalsePositives()
        }

        this.client.disconnect()
    }

}

new MassBanAndClean().init()
