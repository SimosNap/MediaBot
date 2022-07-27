const Parser = require('rss-parser');
const cron = require('node-cron');
const Yourls = require('node-yourls/yourls');
const weather = require('openweather-apis');
require('irc-colors').global();

module.exports = class meteo {
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
    
    getDirection(degrees) {
        // Define array of directions
        const directions = ['sud', 'nord est', 'est', 'sud est', 'sud', 'sud ovest', 'ovest', 'nord ovest'];
        
        // Split into the 8 directions
        degrees = degrees * 8 / 360;
        
        // round to nearest integer.
        degrees = Math.round(degrees, 0);
        
        // Ensure it's within 0-7
        degrees = (degrees + 8) % 8
        
        //console.log(directions[degrees])
        return directions[degrees];
    }
    
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    constructor(bot, config, channels, dbCon) {
        const yourlsUrl = config.yourls_url;
        const yourlsApi = config.yourls_api;
        
        const apiKey = 'aaad8f7b7161622157e7ccdea2b13743';
        
        
        this.lastRequests = {};

        this.shortener = new Yourls(yourlsUrl, yourlsApi);

        
        this.cache = {};
        this.cacheDate = {};

        bot.on('bot.command.meteo', async (event) => {
            const chan = channels[event.replyTarget.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }
            
            if (this.lastRequests[chan] && this.lastRequests[chan] + 3000 > Date.now()) { 
                //console.log("Flood!");
                bot.notice(event.nick, 'Troppe richieste consecutive nel canale, attendi qualche secondo.');
                return;
            }
            
            this.lastRequests[chan] = Date.now();
            
            if (!event.botParams[0]) {
                bot.notice(event.nick, 'Specifica la località per il meteo');
                return;
            }


            let city = event.botParams.join(' ');

            // 1800000 = 30m
            if (!this.cacheDate[city] || Date.now() - 1800000 > this.cacheDate[city]) {
                //console.log(city);
                
                if (city.toLowerCase() == 'roma') {
                    city = 'roma,it';
                }
            
                weather.setLang('it');
                weather.setCity(city);
                weather.setUnits('metric');
                weather.setAPPID(apiKey);
            
                const weatherPromise = new Promise((resolve, reject) => {
                    weather.getAllWeather((err, JSONObj) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(JSONObj);
                    });
                });
                this.cache[city] = await weatherPromise.catch((err) => {
                    console.error('error getting weather', err);
                    return;
                });
                this.cacheDate[city] = Date.now();
            }
            //console.log(this.cache[city]);
            
            let direction = this.getDirection(this.cache[city].wind.deg);
            let speed = (this.cache[city].wind.speed * 3.6).toFixed(2);
            let date = new Date(+this.cache[city].dt * 1000);
            const weblink = 'https://media.simosnap.com/meteo/' + this.cache[city].id;
            const shortener = await this.shortenURL(weblink, this.cache[city].name);
            const shortURL = 'https://ilnk.page/' + shortener.url.keyword;
            
            const tagData = [
                this.cache[city].name,
                this.cache[city].weather[0].description,
                this.cache[city].main.temp,
                this.cache[city].main.feels_like,
                direction,
                speed,
                this.cache[city].clouds.all,
                this.cache[city].main.humidity,
                this.cache[city].id,
                this.cache[city].weather[0].icon,
                this.cache[city].main.pressure,
                date.toLocaleDateString('it-IT') + ' ' + date.toLocaleTimeString(),
                this.cache[city].visibility,
                
            ];
            bot.say(chan.name, `🌎 ${this.cache[city].name.toUpperCase().irc.teal.bold()}: ${this.capitalizeFirstLetter(this.cache[city].weather[0].description)}, temperatura ${this.cache[city].main.temp}° percepiti ${this.cache[city].main.feels_like}°, vento direzione ${direction} ${speed}km/h, presenza di nubi ${this.cache[city].clouds.all}%, umidità ${this.cache[city].main.humidity}% [ Leggi tutto: ${shortURL} ]`, { '+simosnap.org/meteo': tagData.join(';') });
                    
        });
    }
};
