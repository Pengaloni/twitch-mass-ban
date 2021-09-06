# Twitch Mass Ban script

The purpose of this script is to ban known maliciouse bots and users on a selected Twitch channel. It is designed to work on lower end hardware like Raspberry/Orange Pis.

This program can also be ran on cronjob as well, which can be helpful as the list grows.

This script fetches the banlist from [Hackbolt's list of bots and bigots](https://github.com/hackbolt/twitchbotsnbigots), and unbans known false positives.

As the script bans and unbans users, it saves their usernames on dedicated files (see below), to avoid banning or unbanning the same users over and over again.
These files **are not versioned**; this means that the user of the program should find a way to back it up.

## Requirements

- Node.js >= 14 - [installation recommended with nvm](https://github.com/nvm-sh/nvm)

## Environments

This script was tested on Ubuntu under WSL and an Orange Pi with Armbian, although any OS that can run Node.js should be able to run this script as well.

## Getting the credentials

1. Login with the Twitch account you want to use this script with (Recommended: don't use your main account, as you will be unable to use this script and connect to chat at the same time);
2. Get the credentials from [twitchapps.com](https://twitchapps.com/tmi/)
3. From this page, get the oauth link it returns; **Do NOT share this token with ANYONE!**

## Filling the credentials

1. copy `.env.template` to `.env`
2. Fill the credentials as follows, after the = sign:
   - OAUTH_TOKEN: the token obtained from twitchapps.com;
   - USERNAME: the username of the account you used to get the oauth token;
   - CHANNEL: channel you want to ban the bots on.

## Running the script

1. Open a terminal and navigate to its folder;
   - If `banned-users.txt` does not exist, create it as an empty file or copy `banned-users.txt.template` while removing `.template`. This is where the script will store every user who was banned.
   - If `unbanned-users.txt` does not exist, create it as an empty file or copy `unbanned-users.txt.template` while removing `.template`. This is where the script will store every user who was unbanned.
   - Please notice that these files are **not versioned**, meaning you have to take care of backing them up.
2. Run the installation:

   `npm install`

3. Build the script with:

   `npm run build`

4. Run the script with:

   `node .`
