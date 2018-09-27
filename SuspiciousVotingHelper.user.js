// ==UserScript==
// @name         Suspicious Voting Helper
// @description  Assists in building suspicious votes CM messages. Highlight same users across IPxref table.
// @homepage     https://github.com/samliew/SO-mod-userscripts
// @author       @samliew
// @version      1.0.8
//
// @include      https://*stackoverflow.com/*
// @include      https://*serverfault.com/*
// @include      https://*superuser.com/*
// @include      https://*askubuntu.com/*
// @include      https://*mathoverflow.net/*
// @include      https://*.stackexchange.com/*
//
// @exclude      *chat.*
// @exclude      https://stackoverflow.com/c/*
// ==/UserScript==

(function() {
    'use strict';

    // Moderator check
    if(typeof StackExchange == "undefined" || !StackExchange.options || !StackExchange.options.user || !StackExchange.options.user.isModerator ) return;


    const newlines = '\n\n';
    const strToRep = str => Number(str.replace(/\.(\d)k/, '$100').replace(/k/, '000').replace(/[^\d]+/g, ''));


    function mapVotePatternItemsToObject() {
        const link = $('.user-details a', this);
        const uRep = $('.reputation-score', this);
        const vArr = $(this).children('td').eq(2).text().split(' / ');
        const vNum = Number(vArr[0]);
        const vTotal = Number(vArr[1]);
        const vtype = $(this).children('td').eq(1).text().trim();
        const vtypeText = vtype === 'dn' ? 'down' : (vtype === 'up' ? 'up' : 'acc');
        const vPct = Math.round(vNum / vTotal * 100);
        return {
            uid: link.attr('href').match(/\/(\d+)\//)[0],
            userlink: link.attr('href'),
            username: link.text(),
            userrep: strToRep(uRep.text()),
            type: vtypeText,
            votes: vNum,
            votesTotal: vTotal,
            votesPct: vPct,
            size: (vNum >= 10 || vPct >= 25) ? 'large' : '',
            used: false,
        }
    }


    function mapInvVotePatternItemsToObject() {
        const link = $('.user-details a', this);
        const uRep = $('.reputation-score', this);
        const vNum = Number($(this).children('td').eq(1).text());
        console.log($(this));
        return {
            uid: link.attr('href').match(/\/(\d+)\//)[0],
            userlink: link.attr('href'),
            username: link.text(),
            userrep: strToRep(uRep.text()),
            type: 'invalidated ',
            votes: vNum,
            votesTotal: vNum,
            votesPct: '',
            size: vNum >= 5 ? 'large' : '',
            used: false,
        }
    }


    function updateModTemplates() {

        const uid = location.pathname.match(/\d+$/)[0];
        const userlink = $('.userlink a').filter((i,el) => el.href.includes(`/${uid}/`)).first();
        const template = $('.popup input[name=mod-template]').filter((i,el) => $(el).next().text().includes('suspicious voting'));

        let addstr = `This user has a [suspicious history](https://${location.hostname}/admin/show-user-votes/${uid}) of cross-voting and/or targeted votes.` + newlines;
        let appstr = `*(there may also be other minor instances of targeted votes that are unknown to us, as we can only view votes between users if they are above a certain threshold)*`;

        // If template is selected
        let flags, votesFrom, votesTo, votesFromInv, votesToInv;
        $.when(

            // Load latest flagged posts and get mod flags that suggest suspicious voting
            $.get(`https://${location.hostname}/users/flagged-posts/${uid}`).then(function(data) {
                flags = $('#mainbar .mod-flag', data);

                // Format flags
                flags = flags.filter(function(i,el) {
                    return $(el).find('.flag-outcome').length == 0 &&
                        /\b((up|down)vot(es?|ing)|sock|revenge|serial|suspicious)/.test($(el).find('.revision-comment').text());
                })
                .each(function(i,el) {
                    $(el).find('a').each(function() { this.innerText = this.href; });
                    $(el).find('.relativetime').each(function() { this.innerText = '*' + this.title + '*'; });
                    $(el).find('.mod-flag-indicator').remove();
                })
                .get().map(v => v.innerText.replace(/\s*(\n|\r)\s*/g,' ').trim());
            }),

            // Load votes
            $.get(`https://${location.hostname}/admin/show-user-votes/${uid}`).then(function(data) {
                const tables = $('.cast-votes:first > td', data);
                votesFrom = tables.first().find('.voters tbody tr').map(mapVotePatternItemsToObject).get();
                votesTo = tables.last().find('.voters tbody tr').map(mapVotePatternItemsToObject).get();

                const tablesInv = $('.cast-votes:last > td', data);
                votesFromInv = tablesInv.first().find('.voters tbody tr').map(mapInvVotePatternItemsToObject).get();
                votesToInv = tablesInv.last().find('.voters tbody tr').map(mapInvVotePatternItemsToObject).get();
            })

        ).then(function() {

            //console.log(flags);
            //console.table(votesFrom);
            //console.table(votesTo);
            //console.table(votesFromInv);
            //console.table(votesToInv);

            // Build evidence
            let evidence = `Please invalidate the votes shared between these users:` + newlines;

            // Check for users in the four vote tables
            votesFrom.forEach(function(v,i) {

                for(let i = 0; i < votesTo.length; i++) {
                    if(v.uid === votesTo[i].uid && v.type !== 'acc' && votesTo[i].type !== 'acc') {
                        evidence += `- Although this user has both received ${v.votes} ${v.type}votes from, and given ${votesTo[i].votes} ${votesTo[i].type}votes to [${v.username}](${v.userlink}),
it doesn't seem that this account is a sockpuppet due to different PII and are most likely studying/working together.` + newlines;

                        // Invalidate used entries
                        v.used = true;
                        votesTo[i].used = true;
                        return;
                    }
                }

                // Also check for already invalidated votes
                for(let i = 0; i < votesToInv.length; i++) {
                    if(v.uid === votesToInv[i].uid && v.type !== 'acc') {
                        evidence += `- Although this user has both received ${v.votes} ${v.type}votes from, and previously given ${votesToInv[i].votes} *invalidated* votes to [${v.username}](${v.userlink}),
it doesn't seem that this account is a sockpuppet due to different PII and are most likely studying/working together.` + newlines;

                        // Invalidate used entries
                        v.used = true;
                        votesToInv[i].used = true;
                        return;
                    }
                }
            });

            // Get users with high vote ratio
            votesFrom.filter(v => !v.used).forEach(function(v,i) {
                if(v.votesPct >= 50 && v.type !== 'acc' && v.userrep < 100000) {

                    let temp = `- This user has received a ${v.size} percentage of targeted ${v.type}votes (${v.votes}/${v.votesTotal} **${v.votesPct}%**) from [${v.username}](${v.userlink})`;

                    // Targeted and targeted invalidated
                    for(let i = 0; i < votesFromInv.length; i++) {
                        if(v.uid === votesFromInv[i].uid) {
                            evidence += temp + ` *(some votes are already invalidated)*.` + newlines;

                            // Invalidate used entries
                            v.used = true;
                            return;
                        }
                    }

                    // No targeted (default)
                    evidence += temp + '.' + newlines;
                    v.used = true;
                }
            });
            votesTo.filter(v => !v.used).forEach(function(v,i) {
                if(v.votesPct >= 50 && v.type !== 'acc' && v.userrep < 100000) {
                    evidence += `- This user has given a ${v.size} percentage of targeted ${v.type}votes (${v.votes}/${v.votesTotal} **${v.votesPct}%**) to [${v.username}](${v.userlink}).` + newlines;
                    v.used = true;
                }
            });

            // Get users with >= 5 targeted votes
            votesFrom.filter(v => !v.used).forEach(function(v,i) {
                if(v.votes >= 5 && v.type !== 'acc' && v.userrep < 100000) {

                    let temp = `- This user has received a ${v.size} number of targeted ${v.type}votes (**${v.votes}**/${v.votesTotal} *${v.votesPct}%*) from [${v.username}](${v.userlink})`;

                    // Targeted and targeted invalidated
                    for(let i = 0; i < votesFromInv.length; i++) {
                        if(v.uid === votesFromInv[i].uid) {
                            evidence += temp + ` *(some votes are already invalidated)*.` + newlines;

                            // Invalidate used entries
                            v.used = true;
                            return;
                        }
                    }

                    // No targeted (default)
                    evidence += temp + '.' + newlines;
                    v.used = true;
                }
            });
            votesTo.filter(v => !v.used).forEach(function(v,i) {
                if(v.votes >= 5 && v.type !== 'acc' && v.userrep < 100000) {
                    evidence += `- This user has given a ${v.size} number of targeted ${v.type}votes (**${v.votes}**/${v.votesTotal} *${v.votesPct}%*) to [${v.username}](${v.userlink}).` + newlines;
                    v.used = true;
                }
            });

            // Display flags from users
            if(flags.length > 0) {
                let flagtext = `Reported via [custom flag](https://${location.hostname}/users/flagged-posts/${uid}):\n`;
                flags.forEach(function(v) {
                    flagtext += newlines + '> ' + v;
                });

                appstr = flagtext + newlines + appstr;
            }

            // Insert to template
            addstr += evidence;
            template.val(
                template.val()
                    .replace(/:\n/, ':<br>') // remove newline after :
                    .replace(/(https[^\s]+)/, '$1?tab=reputation') // change userlink to rep tab
                    .replace(/\n\n{todo}/, addstr + appstr) // replace todo with evidence
            );

        }); // End then
    }


    function doPageload() {

        // If on xref-user-ips page
        if(location.pathname.includes('/admin/xref-user-ips/')) {

            // Populate each user row with their uid
            const userrows = $('#xref-ids td tbody tr').each(function() {
                $(this).attr('data-uid', $(this).find('a').first().attr('href').match(/\d+$/)[0]);
            })

            // Highlight same user across IPs
            .hover(function() {
                const uid = this.dataset.uid;
                userrows.removeClass('active').filter(`[data-uid=${uid}]`).addClass('active');
            }, function() {
                userrows.removeClass('active');
            })

            // Pin highlight on clicked user
            .click(function() {
                const uid = this.dataset.uid;
                const isFocus = $(this).hasClass('focus');
                userrows.removeClass('focus');
                if(!isFocus) userrows.filter(`[data-uid=${uid}]`).addClass('focus');
            });

            // Select current user on page load
            const currUid = location.pathname.split('/').pop() || '';
            $(`a[href$="/users/${currUid}"]`).first().closest('tr').triggerHandler('click');
        }

        // CM message page
        if(location.pathname.includes('/admin/cm-message/')) {

            // Linkify user ids in preformatted elements
            const uidRegex = /\b(\d{4,})\b/g;
            $('.msg-body pre code').each(function() {
                this.innerHTML = this.innerHTML.replace(uidRegex, `<a href="https://${location.hostname}/users/$1" target="_blank">$1</a>`);
            });
        }
    }


    function listenToPageUpdates() {

        // On any page update
        $(document).ajaxComplete(function(event, xhr, settings) {

            // If mod popup loaded
            if(settings.url.includes('/admin/contact-cm/template-popup/')) {
                setTimeout(updateModTemplates, 200);
            }
        });

    }


    function appendStyles() {

        const styles = `
<style>
tr[data-uid] {
    cursor: cell;
}
tr[data-uid].active {
    background: #ffc;
}
tr[data-uid].focus {
    background: #cfc;
}
</style>
`;
        $('body').append(styles);
    }


    // On page load
    appendStyles();
    doPageload();
    listenToPageUpdates();

})();