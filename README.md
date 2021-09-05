# Twitch Mass Ban script

The purpose of this script is to ban known maliciouse bots and users on a selected Twitch channel. It is designed to work on lower end hardware like Raspberry/Orange Pis.

This program can also be ran on cronjob as well, which can be helpful as the list grows.

This script fetches the banlist from [Hackbolt's list of bots and bigots](https://github.com/hackbolt/twitchbotsnbigots), and unbans known false positives.

## Requirements

- Node.js >= 14 [install recommended with nvm](https://github.com/nvm-sh/nvm)

## Getting the credentials

1. Login with the Twitch account you want to use this script with (Recommended: don't use your main account, as you will be unable to use this script and connect to chat at the same time);
2. Get the credentials from [twitchapps.com](https://twitchapps.com/tmi/)
3. From this page, get the oauth link it returns; **Do NOT share this token with ANYONE!**

## Filling the credentials

1. copy `.env.template` to `.env`
2. Fill the credentials as follows, after the = sign:
   - OAUTH_TOKEN: the token obtained from twitchapps.com;
   - USERNAME: the username of the account you used to get the oauth token;
   - CHANNEL: your Twitch channel name.

## Running the script

1. Open a terminal and navigate to its folder;
   - If `banned-users.txt` does not exist, create it as an empty file or copy `banned-users.txt.template`. This is where the script will store every user who was banned.
   - Please not that this file is **not versioned**, meaning you have to take care of backing it up.
2. Run the installation:

`npm install`

3. Build the script with:

`npm run build`

4. Run the script with:

`node .`
