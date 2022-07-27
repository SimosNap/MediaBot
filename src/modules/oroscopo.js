const Parser = require('rss-parser');
const cron = require('node-cron');
const Yourls = require('node-yourls/yourls');
const HTMLParser = require('node-html-parser');
require('irc-colors').global();

module.exports = class oroscopo {
    shortenURL(url, title) {
        return new Promise((resolve, reject) => {
            this.shortener.shorten(
                url,
                title,
                (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(result);
                },
            );
        });
    }

    constructor(bot, config, channels, dbCon) {
        const yourlsUrl = config.yourls_url;
        const yourlsApi = config.yourls_api;
        
        this.lastRequests = {};

        this.shortener = new Yourls(yourlsUrl, yourlsApi);

        const parser = new Parser();
        // cambiare con https://it.horoscopofree.com/rss/horoscopofree-it.rss
        //const feedUrl = 'https://www.oroscopo.it/feed';
        const feedUrl = 'https://it.horoscopofree.com/rss/horoscopofree-it.rss';
        const signUrl = 'https://it.horoscopofree.com/partner-';

        const signs = ['ariete','sagittario','pesci','aquario','capricorno','scorpione','bilancia','vergine','leone','cancro','gemelli','toro'];
        
        this.cache = {};
        this.cacheDate = 0;

        bot.on('bot.command.oroscopo', async (event) => {
            const chan = channels[event.replyTarget.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }
            
            if (this.lastRequests[chan] && this.lastRequests[chan] + 3000 > Date.now()) { 
                //console.log("Flood!");
                bot.notice(event.nick, 'Troppe richieste consecutive nel canale, attendi qualche secondo.');
                return;
            }
            
            this.lastRequests[chan] = Date.now();
            


            if (!event.botParams[0]) {
                bot.notice(event.nick, 'Specifica il segno zodiacale di cui vuoi leggere l\'oroscopo del giorno!');
                return;
            }

            const possibleSigns = signs.filter((s) => s.indexOf(event.botParams[0].toLowerCase()) === 0);

            if (possibleSigns.length !== 1) {
                bot.notice(event.nick, 'Failed to match star sign');
                return;
            }

            const wantedSign = possibleSigns[0];

            // 7200000 = 2h
            if (Date.now() - 7200000 > this.cacheDate) {
                try {
                    const feed = await parser.parseURL(feedUrl);
                    for (let signData of feed.items) {
                        //const sign = signData.title.split(':')[0].toLowerCase();
                        const sign = signData.title.toLowerCase();
                        const link = signUrl + sign;
                        //const shortUrl = await this.shortenURL(signData.guid, signData.title);
                        const shortUrl = await this.shortenURL(link, signData.title);
                        //const parsedHtml = HTMLParser.parse(signData['content:encoded']);
                        //console.log(signData);
                        //let content = parsedHtml.querySelector('p.horoscope').text;
                        let content = signData.content;
                        if (content.length > 200) {
                            // regex will split at word boundaries to make string <= 200 (plus ' ...')
                            content = content.match(/.{1,225}(?=\s)|.+$/g)[0] + ' ...';
                        }

                        this.cache[sign] = {
                            title: signData.title,
                            url: 'https://ilnk.news/' + shortUrl.url.keyword,
                            content,
                        };
                    }
                    this.cacheDate = Date.now();
                } catch (err) {
                    console.log('failed to update horoscope data', err);
                }
            }

            const tagData = [
                wantedSign,
                this.cache[wantedSign].url,
                this.cache[wantedSign].content,
            ];
            bot.say(chan.name, `🌓 ${wantedSign.toUpperCase().irc.teal.bold()}: ${this.cache[wantedSign].content} [ Leggi tutto: ${this.cache[wantedSign].url} ]`, { '+simosnap.org/oroscopo': tagData.join(';') });
                    
        });
    }
};
