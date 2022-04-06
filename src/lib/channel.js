const IrcChannel = require('irc-framework/src/channel');

module.exports = class Channel extends IrcChannel {
    constructor(ircClient, channelName, channelKey) {
        super(ircClient, channelName, channelKey);

        ircClient.on('join', (event) => {
            if (event.nick !== ircClient.user.nick || event.channel !== this.name) {
                // Not this user or channel
                return;
            }

            // Update user list
            this.who();
        });
    }

    who(cb) {
        const updateUserList = (event) => {
            if (this.irc_client.caseCompare(event.target, this.name)) {
                this.irc_client.removeListener('wholist', updateUserList);

                for (const eventUser of event.users) {
                    const userData = {
                        nick: eventUser.nick,
                        ident: eventUser.ident,
                        hostname: eventUser.hostname,
                        modes: eventUser.channel_modes,
                        realname: eventUser.real_name,
                        account: eventUser.account || false,
                    };

                    let user = this.getUser(eventUser.nick);
                    if (!user) {
                        // New user
                        user = userData;
                        this.users.push(user);
                    } else {
                        // Apply user info to existing object
                        Object.assign(user, userData);
                    }

                    if (!!eventUser.away !== !!user.away) {
                        // The user may have an away message
                        // only overwrite it if the state differs
                        user.away = eventUser.away ? 'Away' : '';
                    }
                }

                if (typeof cb === 'function') {
                    cb(this);
                }
            }
        };

        this.irc_client.on('wholist', updateUserList);
        this.irc_client.who(this.name);
    }

    getUser(nick) {
        return this.users.find((u) => this.irc_client.caseCompare(u.nick, nick));
    }
};
