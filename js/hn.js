/*
* Hacker News Enhancement Suite (HNES)
* Chris James / etcet.net / chris@etcet.net
*
* Thanks to both Wayne Larson and jarques for their code
*
* HN+ for Chrome v1.5 - https://github.com/jarquesp/Hacker-News--
*   by @jarques
*
* hckrnews.com extension - http://hckrnews.com/about.html
*   by Wayne Larson (wvl)
*
* Thanks to Samuel Stern for the inline replying
*
* Under MIT license, see LICENSE
*/

var CommentTracker = {
    init: function() {
        var page_info = CommentTracker.getInfo();
        HN.getLocalStorage(page_info.id, function(response) {
            var data = response.data;
            var prev_last_id = CommentTracker.process(data, page_info);
            CommentTracker.highlightNewComments(prev_last_id);
        });
    },

    highlightNewComments: function(last_id) {
        var comments = document.querySelectorAll('.hnes-comment');

        for (var i = 0; i < comments.length; i++) {
            var id = comments[i].getAttribute('id');
            var comment = HN.hnComments.nodeMap[id];

            if (Number(id) > Number(last_id)) {
                comment.el.classList.remove('hnes-new-parent')
                comment.el.classList.add('hnes-new')
                comment = comment.parent;
                while (comment && comment.level > 0) {
                    if (!comment.el.classList.contains('hnes-new')) {
                        comment.el.classList.add('hnes-new-parent');
                    }
                    comment = comment.parent;
                }
            }
        }
    },

    getInfo: function() {
        // find the 'n comments' / 'discuss' link — never assume it is the last
        // anchor in .subtext (logged-in users get hide/past/favorite after it)
        var comment_info_as = document.querySelectorAll('.subtext a');
        var comment_info_el = null;
        for (var i = comment_info_as.length - 1; i >= 0; i--) {
            var a = comment_info_as[i];
            var href = a.getAttribute('href') || '';
            var text = a.textContent.trim();
            if (/^item\?id=\d+/.test(href) && (text === 'discuss' || /\d\s*comments?/.test(text))) {
                comment_info_el = a;
                break;
            }
        }

        // if there is no 'discuss' or 'n comment(s)' link it's some other kind of page (e.g. profile)
        if (!comment_info_el) {
            return {
                "id": window.location.pathname + window.location.search,
                "num": 0,
                "last_comment_id": CommentTracker.getLastCommentId()
            }
        }

        var page_id = comment_info_el.href.match(/id=(\d+)/);
        if (page_id) {
            page_id = Number(page_id[1]);
        }
        else {
            var loc_id = window.location.search.match(/id=(\d+)/);
            page_id = loc_id ? Number(loc_id[1]) : window.location.pathname + window.location.search;
        }

        var comment_info_text = comment_info_el.textContent;
        var comment_num = comment_info_text.split(" ")[0];
        if (comment_num) {
            comment_num = Number(comment_num);
        }

        var last_id = CommentTracker.getLastCommentId();

        return { "id": page_id, "num": comment_num, "last_comment_id": last_id }
    },

    getLastCommentId: function() {
        var ids = new Array();
        var comments = document.querySelectorAll('.hnes-comment');

        for (var i = 0; i < comments.length; i++) {
            var id = comments[i].getAttribute('id');
            ids.push(Number(id));
        }

        return ids.sort(function(a, b) { return b - a })[0];
    },

    process: function(data, request) {
        var new_info = {
            id: request.id,
            expire: new Date().getTime() + 432000000
        }
        var info = data ? JSON.parse(data) : new_info;

        if (request.num) { info.num = request.num; }

        var last_comment_id = info.last_comment_id;
        if (request.last_comment_id)
            info.last_comment_id = request.last_comment_id;

        // store info
        HN.setLocalStorage(request.id, JSON.stringify(info));

        return last_comment_id;
    },

    checkIndexPage: function() {
        $$('.comments').forEach(function(el) {
            var href = el.getAttribute('href');
            if (href) {
                var idMatch = href.match(/id=(\d+)/);
                if (idMatch) {
                    var id = Number(idMatch[1]);
                }
                else {
                    //For some reason, the link we are processing is not to an HN comment section
                    //I have observed this happening on dead links, which seem to grab the URL from the "web" link
                    return;
                }
                HN.getLocalStorage(id, function(response) {
                    if (response.data) {
                        var data = JSON.parse(response.data);
                        var num = Number(el.textContent);

                        var diff = num - data.num;
                        if (diff > 0) {
                            var newcomm = createEl('<span class="newcomments" title="New Comments"></span>').firstElementChild;
                            newcomm.textContent = diff + ' / ';
                            var totalcomm = createEl('<span class="totalcomments" title="Total Comments"></span>').firstElementChild;
                            totalcomm.textContent = el.textContent;
                            el.textContent = '';
                            el.appendChild(newcomm);
                            el.appendChild(totalcomm);
                        }
                    }
                });
            }
        });
    }
}

class HNComments {
    constructor(storyId) {
        var injector = document.createElement('div');
        injector.innerHTML = `
      <template id="hnes-comment-tmpl">
          <div id="" class="hnes-comment">
              <header>
                  <span class="voteblock">
                    <a href="#" class="upvoter votearrow upvote" title="Upvote" aria-label="Upvote"></a>
                    <a href="#" class="downvoter votearrow rotate180 downvote" title="Downvote" aria-label="Downvote"></a>
                  </span>
                  <a class="unvoter unvote" title="Unvote" aria-label="Unvote"></a>
                  <a class="collapser" title="Toggle collapse" role="button" tabindex="0" aria-expanded="true"></a>
                  <span class="score"></span>
                  <span class="author">
                    <a href="" title="User profile"></a>
                    <span class="hnes-user-score-cont noscore" title="User score">(<span class="hnes-user-score"></span>)</span>
                    <span class="hnes-tag-cont">
                      <img class="hnes-tag" title="Tag user" alt="Tag user">
                      <span class="hnes-tagText" title="User tag"></span>
                    </span>
                  </span>
                  <a class="age permalink"></a>
                  <span class="reply-count"></span>
                  <span class="on-story nostory">on <a href=""></a></span>
              </header>
              <section class="body">
                  <div class="text">
                  </div>
                  <footer>
                      <a class="reply">reply</a>
                      <a class="parent">parent</a>
                  </footer>
              </section>
              <section class="replies"></section>
          </div>
      </template>
      `
        this.commentTemplate = injector.firstElementChild;
        this.storyId = storyId;
    }

    extractCommentParts(commentEl) {
        const parts = [];
        if (!commentEl) return parts;

        const container = commentEl.firstElementChild;
        if (!container) return parts;

        const p = document.createElement('p');

        let n = container.firstChild;
        while (n && !(n.nodeName == 'P' || n.nodeName == 'SPAN' || n.nodeName == 'DIV')) {
            p.appendChild(n.cloneNode(true));
            n = n.nextSibling;
        }
        parts.push(p);

        while (n && n.nodeName != 'DIV') {
            parts.push(n.cloneNode(true));
            n = n.nextSibling;
        }
        return parts;
    }

    markupToNodeList(commentTree) {
        if (!commentTree) return;

        var commentTables = commentTree.querySelectorAll('tr.athing table');
        // pages like /bestcomments don't have sub-tables
        if (!commentTables.length) {
            commentTables = commentTree.querySelectorAll('tr.athing')
        }
        if (!commentTables) return;

        const nodeList = new Array(commentTables.length + 1);

        let nodeIndex = 1,
            deleted = 0;

        nodeList[0] = { id: 'root', level: 0, children: [] };

        // record the OP so we can color their name orange
        const original_poster_el = document.querySelector('.subtext a[href^="user?id="]'),
            original_poster = original_poster_el ? original_poster_el.textContent : '';
        if (original_poster_el) {
            original_poster_el.classList.add('original_poster');
        }

        for (let i = 0; i < commentTables.length; i++) {
            const
                t = commentTables[i],
                id = t.parentElement.parentElement.id || t.id,
                upVoteEl = document.getElementById('up_' + id),
                upVoteUrl = upVoteEl ? upVoteEl.href : '',
                downVoteEl = document.getElementById('down_' + id),
                downVoteUrl = downVoteEl ? downVoteEl.href : '',
                unVoteEl = document.getElementById('un_' + id),
                unVoteUrl = unVoteEl ? unVoteEl.href : '',
                isUpVoted = upVoteEl && upVoteEl.classList.contains('nosee'),
                isDownVoted = downVoteEl && downVoteEl.classList.contains('nosee'),
                replyEl = t.querySelector('.reply a'),
                replyUrl = replyEl ? replyEl.href : '',
                ageEl = t.querySelector('.age a'),
                age = ageEl ? ageEl.textContent : '',
                permalinkUrl = ageEl ? ageEl.href : '',
                userEl = t.querySelector('.comhead a[href^="user?id="]'),
                username = userEl ? userEl.textContent : '',
                userUrl = userEl ? userEl.href : '',
                commentEl = t.querySelector('div.comment'),
                isDeleted = !(commentEl && commentEl.firstElementChild),
                textParts = isDeleted ? [] : this.extractCommentParts(commentEl),
                indEl = t.querySelector('td.ind'),
                imgEl = t.querySelector('td.ind img'),
                // current HN emits indent="N"; older markup only had the spacer img width=40*N
                level = (indEl && indEl.getAttribute('indent') !== null
                    ? Number(indEl.getAttribute('indent'))
                    : (imgEl ? Math.floor(Number(imgEl.getAttribute('width')) / 40) : 0)) + 1,
                parentLinkEl = t.querySelector('.par a'),
                parentLinkUrl = parentLinkEl ? parentLinkEl.href : '',
                storyLinkEl = t.querySelector('.onstory a'),
                storyLinkUrl = storyLinkEl ? storyLinkEl.href : '',
                storyLinkText = storyLinkEl ? storyLinkEl.textContent : '',
                userFontEl = userEl ? userEl.querySelector('font') : '',
                userColor = userFontEl ? userFontEl.getAttribute('color') : '',
                isNoob = userColor == "#3c963c",
                isOP = username == original_poster,
                commtextEl = commentEl ? commentEl.querySelector('.commtext') : null,
                commentColor = commtextEl ? (commtextEl.classList[1] || 'c00') : 'c00',
                comheadEl = t.querySelector('span.comhead'),
                comheadText = comheadEl ? comheadEl.textContent : '',
                // HN marks dead/flagged comments either as a text node inside
                // span.comhead or as the whole comment body when showdead is off:
                // <div class="comment noshow">[flagged]</div>
                commentBodyText = commentEl ? commentEl.textContent : '',
                isDead = comheadText.includes('[dead]') || comheadText.includes('[flagged]') ||
                    commentBodyText.includes('[dead]') || commentBodyText.includes('[flagged]'),
                scoreEl = t.querySelector('span.score'),
                score = scoreEl ? scoreEl.textContent : '';

            nodeList[nodeIndex++] = {
                id,
                level,
                upVoteUrl,
                downVoteUrl,
                unVoteUrl,
                isUpVoted,
                isDownVoted,
                replyUrl,
                age,
                username,
                userUrl,
                isDeleted,
                textParts,
                permalinkUrl,
                children: [],
                isCollapsed: false,
                isDirty: false,
                parentLinkUrl,
                storyLinkUrl,
                storyLinkText,
                isNoob,
                isOP,
                commentColor,
                isDead,
                score,
            }
        };
        return nodeList;
    }

    nodeListToTree(nodeList) {
        const s = [], m = { root: nodeList[0] };
        for (let i = 0, j = 1, data = nodeList; j < data.length && data[j]; i++, j++) {
            const p = data[i], c = data[j];
            if (c.level > p.level) s.push(p.id);
            for (let x = 0; x < p.level - c.level; x++) s.pop();
            c.parent = m[s[s.length - 1]] || data[0];
            m[c.parent.id].children.push(c);
            m[c.id] = c;
        }
        return m;
    }

    renderComment(c, into) {
        const
            kids = c.children,
            oddOrEven = c.level % 2 ? 'odd' : 'even',
            clone = document.importNode(this.commentTemplate.content, true),
            commentEl = clone.firstElementChild,
            upvoterEl = commentEl.querySelector('.upvoter'),
            downvoterEl = commentEl.querySelector('.downvoter'),
            unvoterEl = commentEl.querySelector('.unvoter'),
            parentEl = commentEl.querySelector('.parent'),
            authorEl = commentEl.querySelector('.author a'),
            userscoreEl = commentEl.querySelector('.hnes-user-score'),
            tagImageEl = commentEl.querySelector('.hnes-tag'),
            tagTextEl = commentEl.querySelector('.hnes-tagText'),
            voteblockEl = commentEl.querySelector('.voteblock');

        c.el = commentEl;

        tagImageEl.src = chrome.runtime.getURL('/images/tag.svg');

        commentEl.id = c.id;
        commentEl.classList.add(`level-${oddOrEven}`);
        commentEl.querySelector('.age').textContent = c.age;
        if (c.descCount > 0) {
            commentEl.querySelector('.reply-count').textContent = `(${c.descCount} repl${c.descCount == 1 ? 'y' : 'ies'})`;
        }
        if (c.replyUrl) {
            commentEl.querySelector('.reply').href = c.replyUrl;
        } else {
            commentEl.querySelector('.reply').classList.add('noreply');
        }
        commentEl.querySelector('.permalink').href = c.permalinkUrl;
        authorEl.textContent = c.username;
        authorEl.href = c.userUrl;

        if (c.isCollapsed) {
            commentEl.classList.add('collapsed');
            commentEl.querySelector('.collapser').setAttribute('aria-expanded', 'false');
        }

        if (c.level == 1) {
            parentEl.parentNode.removeChild(parentEl);
        }
        else {
            if (c.parentLinkUrl) {
                parentEl.href = c.parentLinkUrl;
                commentEl.querySelector('.reply-count').classList.add('noreply');
            } else {
                parentEl.href = `#${c.parent.id}`;
            }
        }

        if (c.isNoob) {
            authorEl.classList.add('new_user');
        } else if (c.isOP) {
            authorEl.classList.add('original_poster');
        }

        commentEl.querySelector('a.upvote').href = c.upVoteUrl;
        commentEl.querySelector('a.downvote').href = c.downVoteUrl;
        commentEl.querySelector('a.unvote').href = c.unVoteUrl;

        // hide upvotes or downvotes if there's no url in original (i.e. not logged in or not enough karma to downvote)
        if (!c.upVoteUrl) { upvoterEl.classList.add('voted') }
        if (!c.downVoteUrl) {
            downvoterEl.classList.add('voted')
            upvoterEl.classList.add('nodownvote')
        }

        if (c.isUpVoted || c.isDownVoted) {
            upvoterEl.classList.add('voted')
            downvoterEl.classList.add('voted')
        }
        // track the direction of this user's active vote so unvote can undo it correctly
        if (c.isUpVoted) { c.myVote = 1; }
        else if (c.isDownVoted) { c.myVote = -1; }
        else { c.myVote = null; }
        if (c.unVoteUrl) {
            voteblockEl.classList.add('voted');
            unvoterEl.classList.add('voted')
        }

        if (c.storyLinkUrl) {
            commentEl.querySelector('.on-story').classList.remove('nostory');
            commentEl.querySelector('.on-story a').href = c.storyLinkUrl;
            commentEl.querySelector('.on-story a').textContent = c.storyLinkText;
        }

        if (c.commentColor) {
            commentEl.classList.add(c.commentColor);
        }

        if (c.isDead) {
            authorEl.classList.add('dead');
        }

        if (c.score) {
            commentEl.querySelector('.score').textContent = c.score + " by";
            commentEl.querySelector('.score').classList.add('visible');
        }

        for (let parts = c.textParts, textContainer = commentEl.querySelector('.text'), i = 0; i < parts.length; i++) {
            textContainer.appendChild(parts[i]);
        }

        // vote and collapse interactions are delegated (see apply()) so a
        // 1651-comment thread does not attach 4 listeners per comment

        this.renderComments(kids, commentEl.querySelector('.replies'))
        into.appendChild(clone);
    }

    renderComments(comments, into) {
        for (let i = 0; i < comments.length; i++) {
            this.renderComment(comments[i], into);
        }
    }

    static extractUnvoteUrl(html, id) {
        // matches vote?id=N&how=un... whether the href was &amp;-encoded,
        // &-raw, single- or double-quoted; returns null when absent
        var m = html.match(new RegExp("vote\\?id=" + id + "(?:&amp;|&)how=un[^\\s'\"<>]*"));
        if (!m) return null;
        var dom = new DOMParser().parseFromString('<!doctype html><body>' + m[0], 'text/html');
        return dom.body.textContent;
    }

    voteRequest(c, direction) {
        // direction: 1 upvote, -1 downvote, 0 unvote
        var url = direction === 1 ? c.upVoteUrl : direction === -1 ? c.downVoteUrl : c.unVoteUrl;
        if (!url) return;
        var el = c.el;
        var httpRequest = new XMLHttpRequest();
        httpRequest.onload = function(e) {
            if (direction === 0) {
                // undo in the opposite direction of the active vote: -1 for upvote, +1 for downvote
                HN.upvoteUserData(c.username, -c.myVote);
                c.myVote = null;
                // only show up/down vote if we have urls (for logged out users or low karma)
                if (c.upVoteUrl) el.querySelector('.upvoter').classList.remove('voted');
                if (c.downVoteUrl) el.querySelector('.downvoter').classList.remove('voted');
                el.querySelector('.unvoter').classList.remove('voted');
                el.querySelector('.voteblock').classList.remove('voted');
                return;
            }
            // after voting, retrieve the new unvote link from the response;
            // a login/expired reply has none — fall back to letting HN show it
            var unVoteUrl = HNComments.extractUnvoteUrl(httpRequest.responseText, c.id);
            if (!unVoteUrl) {
                window.location.href = url;
                return;
            }
            c.unVoteUrl = unVoteUrl;
            el.querySelector('a.unvote').href = c.unVoteUrl;

            HN.upvoteUserData(c.username, direction);
            c.myVote = direction;
            el.querySelector('.upvoter').classList.add('voted');
            el.querySelector('.downvoter').classList.add('voted');
            var unvoterEl = el.querySelector('.unvoter');
            unvoterEl.classList.add('voted');
            el.querySelector('.voteblock').classList.add('voted');
        };
        httpRequest.onerror = function() {
            // transient failure — let HN render its own response
            window.location.href = url;
        };
        httpRequest.open('GET', url, true);
        httpRequest.send();
    }

    collapse(c) {
        c.isCollapsed = !c.isCollapsed;
        c.isDirty = true;
        c.el.classList.toggle('collapsed', c.isCollapsed);
        var collapserEl = c.el.querySelector(':scope > header > .collapser');
        if (collapserEl) collapserEl.setAttribute('aria-expanded', c.isCollapsed ? 'false' : 'true');
        this.storeMeta();
    }

    getMeta() {
        const now = Date.now();
        const toStore = {};
        preorder(this.nodeMap.root, n => {
            if (n.isDirty) toStore[n.id] = { 'isCollapsed': n.isCollapsed, 't': now };
        });
        return toStore;
    }

    storeMeta() {
        chrome.storage.local.set(this.getMeta());
    }

    loadMeta(nodeMap, callback) {
        const keys = [];
        preorder(nodeMap.root, n => {
            keys.push(n.id);
        });
        chrome.storage.local.get(keys, items => {
            // drop and delete stale entries so collapse state cannot accumulate forever
            const now = Date.now();
            const meta = {};
            const expired = [];
            for (const k of keys) {
                const m = items[k];
                if (!m) continue;
                if (m && typeof m === 'object' && typeof m.t === 'number' && now - m.t <= HN.COLLAPSE_TTL_MS) {
                    meta[k] = m;
                } else {
                    expired.push(k);
                }
            }
            if (expired.length) chrome.storage.local.remove(expired);
            callback(meta);
        })
    }

    prepare(nodeMap, callback) {
        this.loadMeta(nodeMap, meta => {
            const visit = (n) => {
                let acc = 0;
                for (let i = 0; i < n.children.length; i++) {
                    acc += visit(n.children[i], acc);
                }
                const res = acc + n.children.length;
                n.descCount = res;
                n.isCollapsed = Boolean(meta[n.id] && meta[n.id].isCollapsed);
                return res;
            };
            visit(nodeMap.root);
            callback(nodeMap);
        });
    }

    apply() {
        var commentTree = document.querySelector('#hnmain table.comment-tree');
        var itemList = document.querySelector('#hnmain table.itemlist');
        var threadList = document.querySelector('#hnmain table.comments-table');
        if (!commentTree && !itemList && !threadList) {
            console.warn('unrecognized markup detected, no commentTree, itemList, or threadList');
            return;
        } else if (itemList) {
            commentTree = itemList;
        } else if (threadList) {
            commentTree = threadList;
        }

        const nodeMap = this.nodeListToTree(this.markupToNodeList(commentTree));

        this.prepare(nodeMap, nodeMap => {
            this.nodeMap = nodeMap;
            const commentsContainer = document.createElement('div');
            commentsContainer.id = 'hnes-comments';

            try {
                this.wireDelegation(commentsContainer);
                this.renderComments(this.nodeMap.root.children, commentsContainer);
                commentTree.parentNode.replaceChild(commentsContainer, commentTree);
                if (itemList) {
                    commentsContainer.classList.add('nolevels')
                } else {
                    // highlight new comments on threaded pages
                    CommentTracker.init();
                }
                // load and show user tags and point totals
                HN.addInfoToUsers();
            } catch (e) {
                // a parse failure must never blank the thread — the native
                // comment table was never hidden, so it stays readable
                console.error('HNES: comment rendering failed, keeping native markup', e);
            } finally {
                var loading_comments = document.getElementById('loading_comments');
                if (loading_comments) {
                    loading_comments.classList.add('hidden');
                }
            }
        });
    }

    wireDelegation(container) {
        if (this._wired) return;
        this._wired = true;
        var self = this;
        var commentFor = function (el) {
            var commentEl = el.closest('.hnes-comment');
            return commentEl ? self.nodeMap[commentEl.id] : null;
        };

        on(container, 'click', '.collapser', function(e) {
            e.preventDefault();
            var c = commentFor(this);
            if (c) self.collapse(c);
        });
        on(container, 'click', 'a.upvote', function(e) {
            e.preventDefault();
            var c = commentFor(this);
            if (c && c.upVoteUrl) self.voteRequest(c, 1);
        });
        on(container, 'click', 'a.downvote', function(e) {
            e.preventDefault();
            var c = commentFor(this);
            if (c && c.downVoteUrl) self.voteRequest(c, -1);
        });
        on(container, 'click', 'a.unvote', function(e) {
            e.preventDefault();
            var c = commentFor(this);
            if (c && c.unVoteUrl) self.voteRequest(c, 0);
        });
        // keyboard support for the collapser (role=button, tabindex=0)
        container.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var target = e.target;
            if (!target.closest || !target.closest('.collapser')) return;
            e.preventDefault();
            var c = commentFor(target);
            if (c) self.collapse(c);
        });
    }
}

function preorder(n, visit, skip) {
    var die;
    if (!n) return;
    if (!skip) die = visit(n);
    if (die) return;
    for (var i = 0; i < n.children.length; i++) {
        preorder(n.children[i], visit);
    }
}

var HN = {
    init: function() {
        HN.pruneStorage();
        HN.initElements();
        HN.removeNumbers();

        if (/*window.location.pathname != '/submit' &&*/
            window.location.pathname != '/changepw') {
            HN.rewriteNavigation();
        }

        //if user is logged in
        var logout_elems = $contains('.pagetop a', 'logout');
        if (logout_elems.length)
            HN.rewriteUserNav(logout_elems[0].parentElement);

        var pathname = window.location.pathname;
        //More link - can be post index, threads, comments, etc
        //threads is like "etcet's comments"
        //comment listings are like "New Comments"
        //add comment after logging in is "Hacker News | Add Comment"
        var track_comments = true;
        if (pathname == "/x") {
            track_comments = false;
            var title = document.title;
            var words = title.split(" ");
            if (words[1] == "Comments") {
                //normal comments - fallthrough
            }
            else if (words[1] == "comments") {
                //paginated comments, anything other than first page of comments
                //"more comments | Hacker News"
                if (words[0] == "more")
                    pathname = "/more";
                //"user's comments | Hacker News"
                else
                    pathname = "/threads";
            }
            else if (words[0] == "Edit") {
                pathname = "/edit";
            }
            else if (title == "Hacker News | Confirm") {
                pathname = "/confirm";
            }
            else if (title == "Hacker News | Add Comment") {
                pathname = "/reply";
            }
            else if (HN.isLoginPage()) {
                pathname = "/login";
            }
            else {
                pathname = "/news";
                //postlist
            }
        }

        var postPagesRE = /^(?:\/|\/news|\/newest|\/best|\/active|\/classic|\/submitted|\/saved|\/jobs|\/noobstories|\/ask|\/news2|\/over|\/show|\/shownew|\/hidden|\/upvoted)$/;
        if (postPagesRE.test(pathname)) {
            HN.doPostsList();

            if (pathname == '/jobs') {
                document.body.id = "jobs-body";
            }
            if (pathname == '/show' || pathname == '/jobs') {
                // current HN markup: the blurb is a leading <div> inside the
                // content cell, above the story table — restyle it in place
                // instead of guessing at text rows (which now eats subtexts)
                var blurbDiv = $('#content > td > div');
                if (blurbDiv) {
                    var blurbEl = createEl('<p class="blurb"></p>').firstElementChild;
                    while (blurbDiv.firstChild) {
                        blurbEl.appendChild(blurbDiv.firstChild);
                    }
                    var contentTable = $('#content > td > table');
                    if (contentTable) {
                        contentTable.insertAdjacentElement('beforebegin', blurbEl);
                    }
                    blurbDiv.remove();
                }
            }
        }
        else if (pathname == '/edit') {
            document.body.id = "edit-body";
            var editTd = $('tr:nth-child(3) td td:first-child');
            if (editTd) editTd.remove();
        }
        else if (pathname == '/item' ||
            pathname == "/more" ||
            pathname == "/bestcomments" ||
            pathname == "/noobcomments" ||
            pathname == "/newcomments") {

            var morelink = document.querySelector('.morelink');
            if (morelink) {
                $('#content').insertAdjacentElement('afterend', morelink);
            }

            let storyIdResults = /id=(\w+)/.exec(window.location.search)
            let storyId = false;
            if (storyIdResults) {
                storyId = /id=(\w+)/.exec(window.location.search)[1];
            }
            HN.hnComments = new HNComments(storyId);
            HN.doCommentsList(pathname, track_comments);
        }
        else if (pathname == '/favorites' ||
            pathname == '/upvoted') {
            $$("td[colspan='2']").forEach(function(el) { el.style.display = 'none'; });
            $$(".votelinks").forEach(function(el) { el.style.display = 'none'; });
            $$(".ind").forEach(function(el) { el.style.display = 'none'; });
        }
        else if (pathname == '/threads') {
            document.body.id = "threads-body";

            //create new table and try to emulate /item
            var trs = $$('body > center > table > tbody > tr');
            var comments = trs.slice(2, -1);
            var newtable = createEl('<table><tbody></tbody></table>').firstElementChild;
            var newTbody = newtable.querySelector('tbody');
            comments.forEach(function(tr) { newTbody.appendChild(tr); });
            var secondTd = trs[1] ? trs[1].querySelector('td') : null;
            if (secondTd) secondTd.appendChild(newtable);

            var morelink = document.querySelector('.morelink');
            if (morelink) {
                newtable.parentElement.appendChild(morelink);
            }

            HN.hnComments = new HNComments(0);
            HN.doCommentsList(pathname, track_comments);
        }
        /*        else if (pathname == '/newcomments' ||
                         pathname == '/bestcomments' ||
                         pathname == '/noobcomments' ) {
                  HN.addClassToCommenters();
                  HN.addInfoToUsers($('body'));
                }*/
        else if (pathname == '/user') {
            HN.doUserProfile();
        }
        else if (pathname == '/newslogin' ||
            pathname == '/login') {
            HN.doLogin();
        }
        else if ((pathname == '/reply') && HN.isLoginPage()) {
            HN.doLogin(); // reply when not logged in
        }
        else if ((pathname == '/submit') && HN.isLoginPage()) {
            HN.doLogin(); // submit when not logged in
        }
        else if (pathname == '/newpoll') {
            HN.doPoll();
        }
        else {
            //make sure More link is in correct place
            var moreTitles = $contains('.title', 'More');
            moreTitles.forEach(function(el) {
                var prev = el.previousElementSibling;
                if (prev) prev.setAttribute('colspan', '1');
            });
        }
    },

    doPoll: function() {
        document.body.id = 'poll-body';
    },

    isLoginPage: function() {
        return $contains('b', 'Login').length > 0;
    },

    isLoggedIn: function() {
        var logout_elem = $contains('.pagetop a', 'logout');
        return (logout_elem.length > 0 ? true : false);
    },
    initElements: function() {
        var header = $('body > center > table > tbody > tr:first-child');
        var headerTd = header ? header.querySelector('td') : null;
        if (headerTd && headerTd.getAttribute('bgcolor') === "#000000") {
            //mourning
            header = header.nextElementSibling;
            header.previousElementSibling.remove();
            document.body.classList.add('mourning');
        }
        if (header) header.id = 'header';

        var contentIndex = 2;
        var allTrs = $$('body > center > table > tbody > tr');
        if (allTrs[1] && allTrs[1].querySelector('.pagetop')) {
            // There's an announcement underneath header
            contentIndex++;
        }

        var content = allTrs[contentIndex];
        if (content) content.id = 'content';

        //remove empty tr element between header and content
        var emptyTr = allTrs[contentIndex - 1];
        if (emptyTr) emptyTr.remove();

        $$('#header table td').forEach(function(td) { td.removeAttribute('style'); });

        var lastTitle = $('tr:last-child .title');
        if (lastTitle) lastTitle.id = 'more';

        $$('tr[style="height:7px"]').forEach(function(el) { el.remove(); });
        $$('tr[style="height:2px"]').forEach(function(el) { el.remove(); });

        $$('.yclinks').forEach(function(el) {
            var parent = el.parentElement;
            if (parent && parent.tagName === 'CENTER') {
                parent.style.width = "100%";
            }
        });

        var search_domain = "hn.algolia.com";
        HN.setSearchInput($('input[name="q"]'), search_domain);

        var icon = $('img[src="y18.gif"], img[src="y18.svg"]');
        if (icon) {
            var iconParent = icon.parentElement;
            if (iconParent) iconParent.setAttribute('href', 'http://news.ycombinator.com/');
            icon.setAttribute('title', 'Hacker News');
        }
    },

    injectCSS: function() {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'news.css';
        document.head.appendChild(link);
    },

    COLLAPSE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // collapse state expires after 30 days

    pruneStorage: function() {
        // enforces the expiry that used to live in the (never registered)
        // background script: drop thread-info entries whose expire timestamp
        // has passed and legacy collapse markers without a timestamp
        chrome.storage.local.get(null, function(items) {
            var now = Date.now();
            var expired = Object.keys(items).filter(function(k) {
                var v = items[k], o = null;
                if (typeof v === 'string') {
                    try { o = JSON.parse(v); } catch (e) { return false; }
                }
                else if (v && typeof v === 'object') {
                    o = v;
                }
                if (!o || typeof o !== 'object') return false;
                if (typeof o.expire === 'number') return o.expire < now;
                if ('isCollapsed' in o) return typeof o.t !== 'number';
                return false;
            });
            if (expired.length) chrome.storage.local.remove(expired);
        });
    },


    getLocalStorage: function(key, callback) {
        var storageKey = String(key);
        chrome.storage.local.get(storageKey, function(result) {
            callback({ data: result[storageKey] });
        });
    },

    setLocalStorage: function(key, value) {
        var obj = {};
        obj[String(key)] = value;
        chrome.storage.local.set(obj);
    },

    getUserData: function(usernames, callback) {
        var keys = usernames.map(function(u) { return String(u); });
        chrome.storage.local.get(keys, function(result) {
            callback({ data: result });
        });
    },

    doLogin: function() {
        document.body.id = 'login-body';
        document.title = "Login | Hacker News";

        HN.injectCSS();

        // save and remove (to be re-added later) any rogue messages outside of any tag (e.g. "Bad login.")
        var message = '';
        var rogueNodes = Array.from(document.body.childNodes).filter(function(n) { return n.nodeType === 3; });
        rogueNodes.forEach(function(n) {
            message += n.nodeValue;
            n.remove();
        });
        message = message.trim();

        var recover_password_link = $('body > a');
        if (recover_password_link) recover_password_link.remove();

        // remove login header, submit button (will be re-added later)
        var firstB = $('body > b');
        if (firstB) firstB.remove();
        var submitBtn = $('form input[type="submit"]');
        var buttonHtml = submitBtn ? submitBtn.outerHTML : '';
        if (submitBtn) submitBtn.remove();

        var headerHtml = '<tr id="header"><td bgcolor="#ff6600"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px"><tbody><tr><td><a href="http://ycombinator.com"><img src="y18.svg" width="18" height="18" style="border:1px #ffffff solid;"></a></td><td><span class="pagetop" id="top-navigation"><span class="nav-links"><span><a href="/news" class="top" title="Top stories">top</a>|</span><span><a href="/newest" class="new" title="Newest stories">new</a>|</span><span><a href="/best" class="best" title="Best stories">best</a></span></div></span></span></td></tr></tbody></table></td></tr>';

        // wrap content into a table
        var loginForm = $('body > form');
        if (loginForm) {
            loginForm.id = 'login-form';
            // wrap form in <tr id="content"><td>...</td></tr>
            var contentTr = createEl('<tr id="content"><td></td></tr>').firstElementChild;
            var contentTd = contentTr.querySelector('td');
            loginForm.parentNode.insertBefore(contentTr, loginForm);
            contentTd.appendChild(loginForm);
            // wrap content tr in <table>
            var contentTable = createEl('<table border="0" cellpadding="0" cellspacing="0" width="85%"></table>').firstElementChild;
            contentTr.parentNode.insertBefore(contentTable, contentTr);
            contentTable.appendChild(contentTr);

            // add header table row and submit button row
            contentTr.insertAdjacentHTML('beforebegin', headerHtml);
            var lastTrInForm = loginForm.querySelector('tr:last-child');
            if (lastTrInForm) {
                lastTrInForm.insertAdjacentHTML('afterend', '<tr><td></td><td>' + buttonHtml + '</td></tr>');
            }

            // wrap all tables in <center>
            $$('table').forEach(function(table) {
                if (table.parentElement !== document.body) return;
                var center = document.createElement('center');
                table.parentNode.insertBefore(center, table);
                center.appendChild(table);
            });

            loginForm.insertAdjacentHTML('beforebegin', '<h1>Login</h1>');

            if (recover_password_link) {
                loginForm.insertAdjacentElement('beforebegin', recover_password_link);
            }

            // re-add rogue messages previously removed
            if (message) {
                var h1 = $('tr#content > td:first > h1');
                if (h1) h1.insertAdjacentHTML('beforebegin', ' <p id="login-msg">' + message + '</p>');
            }
        }

        // register?
        if ($contains('b', 'Create Account').length > 0) {
            HN.doCreateAccount();
        }
    },

    doCreateAccount: function() {
        // first check if doLogin() has already built a login prompt,
        // then check if there is another form present (e.g. Create Account)
        if (!$('body#login-body')) return;
        var bodyForm = $('body > form');
        if (!bodyForm) return;

        // save and remove title/form
        var formB = $('body > b');
        if (formB) formB.remove();
        bodyForm.id = 'register-form';
        var formContent = bodyForm.outerHTML;
        bodyForm.remove();

        // rebuild title/form inside the existing table
        var contentLastTd = $('tr#content > td:last-child');
        if (contentLastTd) {
            contentLastTd.insertAdjacentHTML('beforeend', formContent);
            var regForm = $('#register-form');
            if (regForm) {
                var submitEl = $('#register-form > input[type="submit"]');
                var buttonHtml = submitEl ? submitEl.outerHTML : '';
                if (submitEl) submitEl.remove();
                var lastTr = regForm.querySelector('tr:last-child');
                if (lastTr) lastTr.insertAdjacentHTML('afterend', '<tr><td></td><td>' + buttonHtml + '</td></tr>');
                regForm.insertAdjacentHTML('beforebegin', '<h1>Create Account</h1>');
            }
        }
    },

    doPostsList: function() {
        document.body.id = "index-body";

        HN.init_keys();
        HN.moveMoreLink();
        HN.formatScore();
        HN.formatURL();

        //check for new comments
        CommentTracker.checkIndexPage();
        //heat map points
        HN.getAndRateStories();
        //enable highlighting of clicked links
        HN.enableLinkHighlighting();
    },

    doCommentsList: function(pathname, track_comments) {
        //add classes to comment page header (OP post) and the table containing all the comments
        var comments;

        var below_header = $$('#content table');

        if (below_header[1]) {
            var loadingP = createEl("<p id='loading_comments'>Loading comments</p>").firstElementChild;
            below_header[1].insertAdjacentElement('beforebegin', loadingP);
        }

        if (pathname == "/item") {
            document.body.id = "item-body";
            if (below_header[0]) below_header[0].classList.add('item-header');

            comments = below_header[1];
            if (comments) comments.classList.add('comments-table');

            var poll = $('.item-header table');
            if (poll)
                HN.graphPoll(poll);

            //linkify self-post text
            var selfPost = $('.item-header tr:nth-child(3)');
            if (selfPost) {
                selfPost.classList.add('self-post-text');
                linkify(selfPost);
            }

            //fix spacing issue #86
            $$('.item-header td').forEach(function(td) { td.removeAttribute('colspan'); });

            //fixes issue #121 (indent on individual comment pages)
            $$(".item-header td[class='ind']").forEach(function(el) { el.remove(); });

            // move reply button to new line.
            $$(".item-header input[type='submit']").forEach(function(el) { el.style.display = "block"; });

            var more = $('.morelink');
            //recursively load more pages on closed thread
            // Always call loadMoreLink — it handles the no-morelink case
            // by calling doAfterCommentsLoad() directly
            HN.loadMoreLink(more);
        }
        else {// if (pathname == "/threads") {
            document.body.id = "threads-body";
            comments = below_header[0];
            if (comments) comments.classList.add('comment-tree');
            HN.doAfterCommentsLoad();
        }

        //do not want to track comments on 'more' pages
        //TODO: infinite scroll and tracking on 'more' pages
        //if (track_comments) {
        //  CommentTracker.init();
        //}
    },

    doUserProfile: function() {
        var contentTd = $('#content > td');
        if (contentTd) contentTd.id = 'user-profile';

        var options = $$('#user-profile tr > td[valign="top"]');
        var user = options[0];
        var created = options[1];
        var karma = options[2];
        var about = options[3];

        if (options.length === 4) {
            //other user pages
            var submittedLink = $('#user-profile a[href^="submitted"]');
            if (submittedLink && submittedLink.parentElement) {
                submittedLink.parentElement.id = 'others-profile-submitted';
            }
            if (about) {
                var aboutNext = about.nextElementSibling;
                if (aboutNext) linkify(aboutNext);
            }
        }
        else {
            //your user page
            var userProfile = $('#user-profile');
            if (userProfile) userProfile.classList.add('your-profile');
            var email = options[4];
            var showdead = options[5];
            var noprocrast = options[6];
            var maxvisit = options[7];
            var minaway = options[8];
            var delay;
            if ($contains('tr > td[valign="top"]', 'topcolor:').length) {
                var topcolor = options[9];
                if (topcolor) {
                    topcolor.classList.add('select-option');
                    var topNext = topcolor.nextElementSibling;
                    if (topNext) topNext.appendChild(createEl('<span>Default: ff6600</span>').firstElementChild);
                }
                delay = options[10];
            }
            else {
                delay = options[11];
            }

            //fix spacing
            [email, showdead, noprocrast, maxvisit, minaway, delay].forEach(function(el) {
                if (el) el.classList.add('select-option');
            });
            var changepwLink = $('#user-profile a[href="changepw"]');
            if (changepwLink && changepwLink.parentElement) {
                changepwLink.parentElement.id = 'your-profile-change-password';
            }

            var karmaNext = karma ? karma.nextElementSibling : null;
            var current_karma = karmaNext ? parseInt(karmaNext.textContent) : 0;
            var karma_for_flag = 21;
            var karma_for_polls = 201;
            var karma_for_downvotes = 501;
            var can_flag_msg;
            var can_create_polls_msg;
            var can_downvote_msg;
            if (current_karma < karma_for_flag) {
                can_flag_msg = createEl('<p>You need ' + (karma_for_flag - current_karma) + ' more karma until you can flag posts.</p>').firstElementChild;
            }
            else {
                can_flag_msg = createEl('<p>You can flag posts.</p>').firstElementChild;
            }
            if (current_karma < karma_for_polls) {
                can_create_polls_msg = createEl('<p>You need ' + (karma_for_polls - current_karma) + ' more karma until you can create a poll.</p>').firstElementChild;
            }
            else {
                can_create_polls_msg = createEl('<p>You can <a href="//news.ycombinator.com/newpoll">create a poll</a>.</p>').firstElementChild;
            }
            if (current_karma < karma_for_downvotes) {
                can_downvote_msg = createEl('<p>You need ' + (karma_for_downvotes - current_karma) + ' more karma until you can downvote comments.</p>').firstElementChild;
            }
            else {
                can_downvote_msg = createEl('<p>You can downvote comments.</p>').firstElementChild;
            }
            if (karmaNext) {
                karmaNext.appendChild(can_flag_msg);
                karmaNext.appendChild(can_create_polls_msg);
                karmaNext.appendChild(can_downvote_msg);
            }

            if (about) {
                var aboutNext2 = about.nextElementSibling;
                if (aboutNext2) {
                    var about_help = aboutNext2.querySelector('a[href="formatdoc"]');
                    if (about_help) {
                        about_help.addEventListener('click', function(e) {
                            e.preventDefault();
                            var input_help = aboutNext2.querySelector('.input-help');
                            if (input_help) {
                                input_help.remove();
                            }
                            else {
                                aboutNext2.appendChild(HN.getFormattingHelp(false));
                            }
                        });
                    }
                }
            }

            if (showdead) {
                var sdNext = showdead.nextElementSibling;
                if (sdNext) {
                    sdNext.appendChild(createEl('<span>Default: no</span>').firstElementChild);
                    sdNext.appendChild(createEl('<p>Showdead allows you to see all the submissions and comments that have been killed by the editors.</p>').firstElementChild);
                }
            }

            if (noprocrast) {
                var npNext = noprocrast.nextElementSibling;
                if (npNext) {
                    npNext.appendChild(createEl('<span>Default: no</span>').firstElementChild);
                    npNext.appendChild(createEl("<p>Noprocast is a way to prevent yourself from spending too much time on Hacker News. If you turn it on you'll only be allowed to visit the site for maxvisit minutes at a time, with gaps of minaway minutes in between.</p>").firstElementChild);
                }
            }

            if (maxvisit) {
                var mvNext = maxvisit.nextElementSibling;
                if (mvNext) mvNext.appendChild(createEl('<span>Default: 20</span>').firstElementChild);
            }
            if (minaway) {
                var maNext = minaway.nextElementSibling;
                if (maNext) maNext.appendChild(createEl('<span>Default: 180</span>').firstElementChild);
            }

            if (delay) {
                var dNext = delay.nextElementSibling;
                if (dNext) {
                    dNext.appendChild(createEl('<span>Default: 0</span>').firstElementChild);
                    dNext.appendChild(createEl('<p>Delay allows you to delay the public posting of comments you make for delay minutes.</p>').firstElementChild);
                }
            }

            //redirect to profile page after updating, instead of /x page
            var updateBtn = $('input[value="update"]');
            if (updateBtn) {
                updateBtn.addEventListener('click', function() {
                    HN.setLocalStorage('update_profile', window.location.href);
                });
            }
        }
    },

    getFormattingHelp: function(links_work) {
        var help = '<p>Blank lines separate paragraphs.</p>' +
            '<p>Text after a blank line that is indented by two or more spaces is reproduced verbatim (this is intended for code).</p>' +
            '<p>Text surrounded by asterisks is italicized, if the character after the first asterisk isn\'t whitespace.</p>';
        if (links_work)
            help += '<p>Urls become links.</p>';

        var wrapper = createEl('<div class="input-help"></div>');
        wrapper.innerHTML = help;
        return wrapper;
    },

    prettyPrintDaysAgo: function(days) {
        //copied from http://stackoverflow.com/a/8942982
        var str = '';
        var values = {
            ' year': 365,
            ' month': 30,
            ' day': 1
        };

        for (var x in values) {
            var amount = Math.floor(days / values[x]);

            if (amount >= 1) {
                str += amount + x + (amount > 1 ? 's' : '');
                if (x != ' day') {
                    str += ' ';
                }
                days -= amount * values[x];
            }
        }

        return str;
    },

    graphPoll: function(poll) {
        var poll_max_width = 500;
        var totalscore = 0;
        var poll_scores = poll ? $$('.default', poll) : [];
        poll_scores.forEach(function(el) {
            var score = Number(el.textContent.split(' ')[0]);
            totalscore += score;
        });
        poll_scores.forEach(function(el) {
            var score = Number(el.textContent.split(' ')[0]);
            if (score > 0) {
                var width = Math.max(1, score / totalscore * poll_max_width);
                var graph_el = createEl('<tr><td></td><td><div class="poll-graph"></div></td></tr>').firstElementChild;
                graph_el.querySelector('div').style.width = width + 'px';
                el.parentElement.insertAdjacentElement('afterend', graph_el);
            }
        });
    },

    loadMoreLink: function(elem) {
        if (!elem) {
            HN.doAfterCommentsLoad();
            return;
        }

        var loading_comments = document.getElementById('loading_comments');
        if (loading_comments) {
            loading_comments.textContent += '.';
        }

        var moreurl = elem.getAttribute('href');
        fetch(moreurl)
            .then(function(resp) { return resp.text(); })
            .then(function(html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var rows = doc.querySelectorAll("center > table > tbody > tr:nth-child(3) > td > table > tbody > tr");
                var commentsTbody = $('.comments-table > tbody');
                if (commentsTbody) {
                    rows.forEach(function(row) {
                        commentsTbody.appendChild(document.importNode(row, true));
                    });
                }
                $$('.morelink').forEach(function(el) { el.remove(); });
                var morelink = $contains('.title a[rel="nofollow"]', 'More')[0];
                if (morelink) {
                    HN.loadMoreLink(morelink);
                } else {
                    HN.doAfterCommentsLoad();
                }
            })
            .catch(function() {
                // fetch failed — render what we already have instead of hanging on "Loading"
                HN.doAfterCommentsLoad();
            });
    },

    doAfterCommentsLoad: function() {
        HN.hnComments.apply();
        var loading_comments = document.getElementById("loading_comments");
        if (loading_comments) {
            loading_comments.textContent = "Rendering comments...";
        }
    },


    parseUserInfo: function(raw) {
        // storage values are JSON strings; very old versions stored a bare
        // number ('1') which must migrate to {votes: 1}
        var info = null;
        if (typeof raw === 'number') info = raw;
        else if (typeof raw === 'string') {
            try { info = JSON.parse(raw); } catch (e) { info = null; }
        }
        else if (raw && typeof raw === 'object') info = raw;
        if (typeof info === 'number') return { votes: info };
        if (info && typeof info === 'object' && !Array.isArray(info)) return info;
        return {};
    },

    addInfoToUsers: function() {
        var author_els = document.querySelectorAll('.author a');
        var usernames = Array.from(author_els).map(x => x.textContent);

        HN.getUserData(usernames, response => {
            if (!response) return;
            var userData = response.data;
            for (var i = 0; i < author_els.length; i++) {
                var author_el = author_els[i],
                    name = usernames[i],
                    rawInfo = userData[name];

                if (rawInfo === undefined || rawInfo === null) continue;
                var info = HN.parseUserInfo(rawInfo);

                // migrate the legacy bare-number format in place
                if (typeof rawInfo === 'number' || /^\s*-?\d+(\.\d+)?\s*$/.test(String(rawInfo))) {
                    HN.setLocalStorage(name, JSON.stringify(info));
                }

                // display user tag and score
                if (info.tag) HN.displayUserTag(author_el, info.tag);
                if (info.votes) HN.displayUserScore(author_el, info.votes);
            }
        });


        on(document, 'click', '.hnes-tag, .hnes-tagText', function(e) {
            // delegated so that the event applies to all elements generated in the future
            HN.editUserTag(e);
        });

        on(document, 'keyup', '.hnes-tagEdit', function(e) {
            var parent = this.parentElement,
                gp = parent ? parent.parentElement : null;

            var finishEdit = function() {
                if (parent) parent.classList.remove('edit');
                this.remove();
            }.bind(this);

            if (e.key === 'Enter') {
                if (gp) {
                    var authorEl = gp.querySelector('a');
                    var author = authorEl ? authorEl.textContent : '';
                    HN.setUserTag(author, this.value);
                }
                finishEdit();
            }
            if (e.key === 'Escape') {
                finishEdit();
            }
        });
    },

    upvoteUserData: function(author, value) { // Adds value to the user's upvote count, saves and displays it.
        HN.getLocalStorage(author, function(response) {
            var userInfo = HN.parseUserInfo(response.data);
            var new_upvote_total = value + (typeof userInfo.votes === 'number' ? userInfo.votes : 0);

            if (new_upvote_total === 0) {
                delete userInfo.votes;
            }
            else {
                userInfo.votes = new_upvote_total;
            }
            HN.setLocalStorage(author, JSON.stringify(userInfo));
            HN.showNewUserScore(author, new_upvote_total); // Set the upvote count
        });
    },

    authorEls: function(author) {
        // exact username match — 'arc' must never hit 'arcfour'
        return $$('.author').filter(function(el) {
            var a = el.querySelector('a');
            return a && a.textContent === author;
        });
    },

    showNewUserScore: function(author, value) {
        var author_els = HN.authorEls(author);
        for (var i = 0; i < author_els.length; i++) {
            var score_el = author_els[i].querySelector('.hnes-user-score');
            if (score_el) {
                if (value !== 0) {
                    score_el.textContent = value;
                    score_el.parentElement.classList.remove('noscore');
                } else {
                    score_el.parentElement.classList.add('noscore');
                }
            }
        }
    },

    displayUserScore: function(el, upvotes) {
        var userscoreEl = el.parentElement.querySelector('.hnes-user-score');
        if (userscoreEl) {
            userscoreEl.textContent = upvotes;
            userscoreEl.parentElement.classList.remove('noscore');
        }
    },

    displayUserTag: function(el, tag) {
        if (!tag) return;
        var tagTextEl = el.parentElement.querySelector('.hnes-tagText');
        if (tagTextEl) tagTextEl.textContent = tag;
    },

    editUserTag: function(e) {
        var target = e.target || e;
        var parent = target.parentElement;
        if (!parent) return;
        // the tag input is created on demand — one per editing session,
        // not one per rendered comment
        var tagEdit = parent.querySelector('.hnes-tagEdit');
        if (!tagEdit) {
            tagEdit = document.createElement('input');
            tagEdit.type = 'text';
            tagEdit.className = 'hnes-tagEdit';
            parent.appendChild(tagEdit);
        }
        parent.classList.add('edit');
        tagEdit.focus();
    },

    setUserTag: function(author, tag) {
        HN.getLocalStorage(author, function(response) {
            var userInfo = HN.parseUserInfo(response.data);

            if (tag !== '')
                userInfo.tag = tag;
            else
                delete userInfo.tag;

            HN.setLocalStorage(author, JSON.stringify(userInfo));
        });

        var commenter = HN.authorEls(author);
        for (var i = 0; i < commenter.length; i++) {
            var tagText = commenter[i].querySelector('.hnes-tagText');
            if (tagText) tagText.textContent = tag;
        }
    },

    removeNumbers: function() {
        $$('td[align="right"]').forEach(function(el) { el.remove(); });
    },

    formatScore: function() {
        $$('.subtext').forEach(function(subtext) {
            var score = subtext.querySelector('span.score');
            var as = subtext.querySelectorAll('a');
            var by = subtext.querySelector('a[href^="user?id="]');
            var at = subtext.querySelector('span.age a');

            // find the real 'n comments' / 'discuss' link — it is not
            // necessarily the last anchor (logged-in rows end with
            // hide/past/favorite)
            var comments = null;
            for (var i = as.length - 1; i >= 0; i--) {
                var href = as[i].getAttribute('href') || '';
                var text = as[i].textContent.trim();
                if (/^item\?id=\d+/.test(href) && (text === 'discuss' || /\d\s*comments?/.test(text))) {
                    comments = as[i];
                    break;
                }
            }

            // scoreless, comment-less rows (e.g. job posts) keep their native subtext
            if (!score && !comments) return;

            if (!score) {
                score = createEl('<span>0</span>').firstElementChild;
            }
            else {
                // note: only the points span is rewritten — the surrounding
                // .subline must survive so hide/flag/favorite stay reachable
                score.textContent = parseInt(score.textContent);
            }
            score.classList.add('score');
            score.setAttribute('title', 'Points');

            var comments_link = comments ? comments.getAttribute('href')
                : (at ? at.getAttribute('href') : '');

            if (!comments || comments.textContent.trim() === 'discuss') {
                var newComments = createEl('<a>0</a>').firstElementChild;
                newComments.setAttribute('href', comments_link);
                comments = newComments;
            }
            else {
                comments.textContent = parseInt(comments.textContent) || '-';
            }

            comments.setAttribute('href', comments_link);
            comments.classList.add('comments');
            comments.setAttribute('title', 'Comments');

            var by_el;
            if (!by) {
                by_el = createEl('<span></span>').firstElementChild;
            }
            else {
                by.setAttribute('title', 'View profile');
                by_el = createEl('<span class="submitter">by </span>').firstElementChild;
                by_el.appendChild(by);
            }

            var score_el = createEl('<td class="hnes-score-col"></td>').firstElementChild;
            score_el.appendChild(score);
            var comments_el = createEl('<td class="hnes-comments-col"></td>').firstElementChild;
            comments_el.appendChild(comments);

            var parent = subtext.parentElement;
            var prev = parent ? parent.previousElementSibling : null;
            if (prev) {
                prev.insertBefore(score_el, prev.firstChild);
                prev.insertBefore(comments_el, prev.firstChild);
                var titleEl = prev.querySelector('.title');
                if (titleEl) titleEl.appendChild(by_el);
            }
            if (parent) {
                if (parent.nextElementSibling) parent.nextElementSibling.remove();
                parent.remove();
            }

            // collect action links into hnes-actions span
            var actionsSpan = createEl('<span class="hnes-actions"></span>').firstElementChild;
            var flagLinks = subtext.querySelectorAll('a[href^="flag"]');
            var vouchLinks = subtext.querySelectorAll('a[href^="vouch"]');
            var algoliaLinks = subtext.querySelectorAll('a[href^="https://hn.algolia.com/?query="]');
            var hideLinks = subtext.querySelectorAll('a[href^="hide"]');
            var googleLinks = subtext.querySelectorAll('a[href^="https://www.google.com/search?q="]');
            var faveLinks = subtext.querySelectorAll('a[href^="fave"]');
            [flagLinks, vouchLinks, algoliaLinks, hideLinks, googleLinks, faveLinks].forEach(function(links) {
                links.forEach(function(link) { actionsSpan.appendChild(link); });
            });
            if (by_el.parentElement) {
                by_el.insertAdjacentElement('afterend', actionsSpan);
            }

            var ageSpan = createEl('<span class="hnes-age"></span>').firstElementChild;
            if (at) ageSpan.textContent = at.textContent;
            if (by_el.parentElement) {
                by_el.insertAdjacentElement('afterend', ageSpan);
            }
        });
    },

    highlightCommentsLink: function(e) {
        this.classList.toggle('hover-comments-score');
        if (this.nextElementSibling) this.nextElementSibling.classList.toggle('hover-comments-score');
    },
    highlightScoreLink: function(e) {
        this.classList.toggle('hover-comments-score');
        if (this.previousElementSibling) this.previousElementSibling.classList.toggle('hover-comments-score');
    },

    formatURL: function() {
        $$('.comhead').forEach(function(el) {
            var text = el.textContent;
            var url_el = createEl('<span></span>').firstElementChild;
            url_el.textContent = text.substring(2, text.length - 1);
            var left_paren = createEl('<span class="paren">(</span>').firstElementChild;
            var right_paren = createEl('<span class="paren">)</span>').firstElementChild;
            el.textContent = '';
            el.appendChild(left_paren);
            el.appendChild(url_el);
            el.appendChild(right_paren);
        });
    },

    moveMoreLink: function() {
        var more = $('#more');
        if (more && more.previousElementSibling) {
            more.previousElementSibling.setAttribute('colspan', '3');
        }
    },
    rewriteUserNav: function(pagetop) {
        var user_links = createEl('<span class="nav-links"></span>').firstElementChild;
        var as = pagetop.querySelectorAll('a');
        var user_profile = as[0];
        var logout = as[1];
        var user_name = user_profile ? user_profile.textContent : '';

        var user_drop = createEl('<span class="more-arrow" id="my-more-link" title="Toggle user links"><a href="#"></a></span>').firstElementChild;
        user_drop.querySelector('a').textContent = user_name;

        // detach logout and user_profile
        if (logout) logout.remove();
        if (user_profile) user_profile.remove();
        var score_str = pagetop.textContent;
        var regex = /\(([^)]+)\)/;
        var matches = regex.exec(score_str);
        var score = matches ? matches[1] : '';

        var score_elem = createEl('<span>|</span>').firstElementChild;
        var karmaSpan = createEl('<span id="my-karma" title="Your karma"></span>').firstElementChild;
        karmaSpan.textContent = score;
        score_elem.appendChild(karmaSpan);
        user_links.appendChild(score_elem);
        while (pagetop.firstChild) pagetop.removeChild(pagetop.firstChild);
        user_links.insertBefore(user_drop, user_links.firstChild);
        pagetop.appendChild(user_links);

        var hidden_div = createEl('<div id="user-hidden" class="nav-drop-down"></div>').firstElementChild;
        var user_pages = [['profile', '/user', 'Your profile and settings'],
        ['comments', '/threads', 'Your comments and replies'],
        ['submitted', '/submitted', "Stories you've submitted"],
        ['upvoted', '/upvoted', "Stories you've voted for"],
        ['favorites', '/favorites', "Stories you've favorited"]
        ];
        var new_active = false;
        for (var i in user_pages) {
            var link_text = user_pages[i][0];
            var link_href = user_pages[i][1];
            var link_title = user_pages[i][2];
            var link = createEl('<a></a>').firstElementChild;
            link.textContent = link_text;
            link.setAttribute('href', link_href + '?id=' + user_name);
            link.setAttribute('title', link_title);

            if (window.location.pathname == link_href) {
                new_active = link.cloneNode(true);
                new_active.classList.add('nav-active-link');
                new_active.classList.add('new-active-link');
            }

            hidden_div.appendChild(link);
        }
        if (new_active) {
            if (window.location.pathname != '/upvoted' || window.location.pathname != '/favorites') {
                var idMatch = window.location.search.match(/id=(\w+)/);
                var user_id = idMatch ? idMatch[1] : '';
                if (user_id == user_name)
                    user_id = 'Your';
                else
                    user_id = user_id + "'s";
                new_active.textContent = user_id + " " + new_active.textContent;
            }
            var navLinks = $('#top-navigation .nav-links');
            if (navLinks) {
                var activeSpan = createEl('<span>|</span>').firstElementChild;
                activeSpan.appendChild(new_active);
                navLinks.appendChild(activeSpan);
            }
        }

        if (logout) {
            logout.id = 'user-logout';
            logout.setAttribute('title', 'Logout');
            hidden_div.appendChild(logout);
        }
        user_links.appendChild(hidden_div);

        var user_drop_toggle = function() {
            var dropA = user_drop.querySelector('a');
            if (dropA) dropA.classList.toggle('active');
            hidden_div.style.display = (hidden_div.style.display === 'none') ? 'block' : 'none';
        };
        user_drop.addEventListener('click', user_drop_toggle);
        hidden_div.addEventListener('click', user_drop_toggle);
        hidden_div.style.display = 'none';
        HN.setTopColor();
    },
    rewriteNavigation: function() {
        var topsel = $('.topsel');
        var navigation = $('td:nth-child(2) .pagetop');
        if (navigation) navigation.id = 'top-navigation';

        var visible_pages = [['top', '/news', 'Top stories'],
        ['new', '/newest', 'Newest stories'],
        ['best', '/best', 'Best stories'],
        ['submit', '/submit', 'Submit a story'],
        ];

        var hidden_pages = [['show', '/show', 'Show HN'],
        ['shownew', '/shownew', 'New Show HN posts'],
        ['classic', '/classic', 'Only count votes from accounts older than one year'],
        ['active', '/active', 'Active stories'],
        ['ask', '/ask', 'Ask Hacker News'],
        ['jobs', '/jobs', 'Sponsored job postings'],
        ['bestcomments', '/bestcomments', 'Best comments'],
        ['newcomments', '/newcomments', 'New comments'],
        ['noobstories', '/noobstories', 'Stories by new users'],
        ['noobcomments', '/noobcomments', 'Comments by new users']
        ];

        if (!topsel) {
            topsel = createEl('<span class="nav-links"></span>').firstElementChild;
            if (navigation) navigation.appendChild(topsel);
        }
        else {
            topsel.classList.remove('topsel');
            topsel.classList.add('nav-links');
            while (topsel.firstChild) topsel.removeChild(topsel.firstChild);
        }
        for (var i in visible_pages) {
            var link_text = visible_pages[i][0];
            var link_href = visible_pages[i][1];

            var span = createEl('<span>|</span>').firstElementChild;
            var new_link = createEl('<a></a>').firstElementChild;
            new_link.setAttribute('href', link_href);
            new_link.textContent = link_text;
            new_link.classList.add(link_text);
            new_link.setAttribute('title', visible_pages[i][2]);

            if (window.location.pathname == link_href)
                new_link.classList.add('nav-active-link');

            span.insertBefore(new_link, span.firstChild);
            topsel.appendChild(span);
        }
        if (window.location.pathname == '/') {
            var topLink = $('.top');
            if (topLink) topLink.classList.add('nav-active-link');
        }

        var more_link = createEl('<span class="more-arrow" id="nav-more-link" title="Toggle more links"><a href="#">more</a></span>').firstElementChild;
        var hidden_div = createEl('<div id="nav-others" class="nav-drop-down"></div>').firstElementChild;

        var new_active = false;
        for (var i in hidden_pages) {
            var link_text = hidden_pages[i][0];
            var link_href = hidden_pages[i][1];

            var new_link = createEl('<a></a>').firstElementChild;
            new_link.setAttribute('href', link_href);
            new_link.setAttribute('title', hidden_pages[i][2]);
            new_link.textContent = link_text;
            new_link.classList.add(link_text);

            if (window.location.pathname == link_href) {
                new_active = new_link.cloneNode(true);
                new_active.classList.add('nav-active-link');
                new_active.classList.add('new-active-link');
            }

            hidden_div.appendChild(new_link);
        }

        topsel.appendChild(more_link);
        topsel.appendChild(hidden_div);

        if (new_active) {
            var activeSpan = createEl('<span>|</span>').firstElementChild;
            activeSpan.appendChild(new_active);
            topsel.appendChild(activeSpan);
        }

        if (navigation) {
            while (navigation.firstChild) navigation.removeChild(navigation.firstChild);
            navigation.appendChild(topsel);
        }

        var toggle_more_link = function() {
            var moreA = more_link.querySelector('a');
            if (moreA) moreA.classList.toggle('active');
            hidden_div.style.display = (hidden_div.style.display === 'none') ? 'block' : 'none';
        };
        more_link.addEventListener('click', toggle_more_link);
        hidden_div.addEventListener('click', toggle_more_link);

        hidden_div.style.left = more_link.offsetLeft + 'px';
        hidden_div.style.display = 'none';
    },

    setTopColor: function() {
        var header = document.getElementById("header");
        if (!header) return;
        var topcolor = header.children[0].getAttribute("bgcolor");
        if (topcolor && topcolor.toLowerCase() != '#ff6600') {
            header.style.backgroundColor = topcolor;
            $$('.nav-drop-down').forEach(function(el) { el.style.backgroundColor = topcolor; });
        }
    },

    setSearchInput: function(el, domain) {
        // a real placeholder — the old value-hack submitted
        // "Search on hn.algolia.com" as the query when unfocused
        if (el) el.setAttribute('placeholder', 'Search on ' + domain);
    },

    init_keys: function() {
        document.addEventListener('keydown', function(e) {
            // never hijack browser/OS shortcuts (⌘C must copy, not open tabs)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // or typing in any field
            var t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                      t.tagName === 'SELECT' || t.isContentEditable)) return;

            switch (e.key && e.key.toLowerCase()) {
                case 'j': HN.next_story(); break;              // Next item
                case 'k': HN.previous_story(); break;           // Previous item
                case 'l': HN.open_story_in_new_tab(); break;    // Open story in new tab
                case 'o': HN.open_story_in_current_tab(); break;
                case 'p': HN.open_comments_in_current_tab(); break;
                case 'c': HN.open_comments_in_new_tab(); break;
                case 'b':                                    // Both, in new tabs
                    HN.open_comments_in_new_tab();
                    HN.open_story_in_new_tab();
                    break;
            }
        });
    },

    open_story_in_current_tab: function() {
        HN.open_story(false);
    },
    open_story_in_new_tab: function() {
        HN.open_story(true);
    },
    open_comments_in_current_tab: function() {
        HN.view_comments(false);
    },
    open_comments_in_new_tab: function() {
        HN.view_comments(true);
    },

    next_story: function() {
        HN.next_or_prev_story(true);
    },
    previous_story: function() {
        HN.next_or_prev_story(false);
    },

    next_or_prev_story: function(next) {
        var current = $('.on_story');
        if (!current) {
            if (next) {
                var firstTr = $('#content tr:first-child');
                if (firstTr) firstTr.classList.add("on_story");
            }
        } else {
            var next_lem = next ? current.nextElementSibling : current.previousElementSibling;
            if (next_lem) {
                next_lem.classList.add("on_story");
                window.scrollTo(0, next_lem.offsetTop - 10);
                current.classList.remove("on_story");
            }
        }
    },

    open_story: function(new_tab) {
        var current = $('.on_story');
        if (current) {
            var story = $('.on_story .title .titleline > a');
            if (story) {
                if (new_tab) {
                    var titleEl = $('.on_story .title');
                    if (titleEl) titleEl.classList.add("link-highlight");
                    window.open(story.getAttribute("href"));
                }
                else
                    window.location = story.getAttribute("href");
            }
        }
    },

    view_comments: function(new_tab) {
        var current = $('.on_story');
        if (current) {
            var comments = $('.on_story .comments');
            if (comments) {
                if (new_tab)
                    window.open(comments.getAttribute("href"));
                else
                    window.location = comments.getAttribute("href");
            }
        }
    },

    getAndRateStories: function() {
        var NO_HEAT = 50;
        var MILD = 75;
        var MEDIUM = 99;
        $$('.score').forEach(function(el) {
            var score = el.innerHTML;
            score = score.replace(/[a-z]/g, '');

            if (score < NO_HEAT) {
                el.classList.add('no-heat');
            } else if (score < MILD) {
                el.classList.add('mild');
            } else if (score < MEDIUM) {
                el.classList.add('medium');
            } else {
                el.classList.add('hot');
            }
        });
    },

    enableLinkHighlighting: function() {
        $$('.title a:link').forEach(function(link) {
            link.addEventListener('click', function() {
                var td = this.closest('td');
                if (td) td.classList.add('link-highlight');
            });
        });
    }
}


//show new comment count on hckrnews.com
if (window.location.host == "hckrnews.com") {
    $$('.entries li').forEach(function(li) {
        var id = Number(li.getAttribute('id'));
        chrome.storage.local.get(String(id), function(result) {
            var raw = result[String(id)];
            if (raw != undefined) {
                var data = JSON.parse(raw);
                var dataId = data.id;
                var num = data.num ? data.num : 0;
                var idEl = document.getElementById(dataId);
                if (idEl) {
                    var commentsEl = idEl.querySelector('.comments');
                    if (commentsEl) {
                        var now = Number(commentsEl.textContent);
                        var unread = Math.max(now - num, 0);
                        var prepend = unread == 0 ? "" + unread + " / " : "<span>" + unread + "</span> / ";
                        commentsEl.insertAdjacentHTML('afterbegin', prepend);
                    }
                }
            }
        });
    });
}
else {
    try {
        HN.init();
    }
    catch (e) {
        // a failed enhancement must degrade to native HN, never a blank page
        console.error('HNES: initialization failed', e);
    }

    function onReady(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    onReady(function() {
        try {
            if (document.body.textContent.includes("Unknown or expired link.")) {
                HN.setLocalStorage('expired', true);
                window.location.replace("/");
                return;
            }
            else {
                HN.getLocalStorage('expired', function(response) {
                    if (response.data) {
                        var headerEl = document.getElementById('header');
                        if (headerEl) {
                            headerEl.insertAdjacentHTML('afterend', '<p id="alert">You reached an <a href="//news.ycombinator.com/item?id=17705" title="what?">expired page</a> and have been redirected back to the front page.</p>');
                        }
                        HN.setLocalStorage('expired', false);
                    }
                });
            }

            //redirect to profile page after updating it
            if (window.location.pathname == "/x") {
                HN.getLocalStorage('update_profile', function(response) {
                    if (response.data) {
                        HN.setLocalStorage('update_profile', false);
                        window.location.replace(response.data);
                    }
                });
            }
        }
        catch (e) {
            console.error('HNES: post-init failed', e);
        }
        finally {
            document.body.style.visibility = 'visible';
        }
    });
}
