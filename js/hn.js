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

const CommentTracker = {
    init() {
        const pageInfo = CommentTracker.getInfo();
        chrome.storage.local.get(String(pageInfo.id)).then((data) => {
            const prevLastId = CommentTracker.process(data[String(pageInfo.id)], pageInfo);
            CommentTracker.highlightNewComments(prevLastId);
        });
    },

    highlightNewComments(lastId) {
        for (const commentEl of $$('.hnes-comment')) {
            const id = commentEl.getAttribute('id');
            let comment = HN.hnComments.nodeMap[id];

            if (Number(id) > Number(lastId)) {
                comment.el.classList.remove('hnes-new-parent');
                comment.el.classList.add('hnes-new');
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

    getInfo() {
        // find the 'n comments' / 'discuss' link — never assume it is the last
        // anchor in .subtext (logged-in users get hide/past/favorite after it)
        const anchors = $$('.subtext a');
        const commentInfoEl = anchors.findLast((a) => {
            const href = a.getAttribute('href') || '';
            const text = a.textContent.trim();
            return /^item\?id=\d+/.test(href) && (text === 'discuss' || /\d\s*comments?/.test(text));
        });

        // if there is no 'discuss' or 'n comment(s)' link it's some other kind of page (e.g. profile)
        if (!commentInfoEl) {
            return {
                id: window.location.pathname + window.location.search,
                num: 0,
                last_comment_id: CommentTracker.getLastCommentId()
            };
        }

        const pageMatch = commentInfoEl.href.match(/id=(\d+)/);
        const locMatch = window.location.search.match(/id=(\d+)/);
        const pageId = pageMatch ? Number(pageMatch[1])
            : locMatch ? Number(locMatch[1])
            : window.location.pathname + window.location.search;

        return {
            id: pageId,
            num: Number(commentInfoEl.textContent.split(' ')[0]),
            last_comment_id: CommentTracker.getLastCommentId()
        };
    },

    getLastCommentId() {
        return $$('.hnes-comment')
            .map((el) => Number(el.getAttribute('id')))
            .sort((a, b) => b - a)[0];
    },

    process(data, request) {
        const info = data ? JSON.parse(data) : {
            id: request.id,
            expire: Date.now() + 432000000
        };

        if (request.num) { info.num = request.num; }

        const lastCommentId = info.last_comment_id;
        if (request.last_comment_id) {
            info.last_comment_id = request.last_comment_id;
        }

        // store info
        chrome.storage.local.set({ [String(request.id)]: JSON.stringify(info) });

        return lastCommentId;
    },

    checkIndexPage() {
        $$('.comments').forEach((linkEl) => {
            const href = linkEl.getAttribute('href');
            if (!href) return;
            const idMatch = href.match(/id=(\d+)/);
            // dead links can carry the story's "web" URL instead of an HN
            // comment link — nothing to track for those rows
            if (!idMatch) return;

            chrome.storage.local.get(idMatch[1]).then((stored) => {
                const raw = stored[idMatch[1]];
                if (!raw) return;

                const data = JSON.parse(raw);
                const diff = Number(linkEl.textContent) - data.num;
                if (diff <= 0) return;

                const newcomm = el('span', 'newcomments');
                newcomm.title = 'New Comments';
                newcomm.textContent = `${diff} / `;
                const totalcomm = el('span', 'totalcomments');
                totalcomm.title = 'Total Comments';
                totalcomm.textContent = linkEl.textContent;
                linkEl.textContent = '';
                linkEl.append(newcomm, totalcomm);
            });
        });
    }
};

class HNComments {
    constructor() {
        const injector = document.createElement('div');
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
      `;
        this.commentTemplate = injector.firstElementChild;
    }

    extractCommentParts(commentEl) {
        const parts = [];
        if (!commentEl) return parts;

        const container = commentEl.firstElementChild;
        if (!container) return parts;

        const p = document.createElement('p');

        let n = container.firstChild;
        while (n && !(n.nodeName === 'P' || n.nodeName === 'SPAN' || n.nodeName === 'DIV')) {
            p.appendChild(n.cloneNode(true));
            n = n.nextSibling;
        }
        parts.push(p);

        while (n && n.nodeName !== 'DIV') {
            parts.push(n.cloneNode(true));
            n = n.nextSibling;
        }
        return parts;
    }

    markupToNodeList(commentTree) {
        if (!commentTree) return;

        let commentTables = commentTree.querySelectorAll('tr.athing table');
        // pages like /bestcomments don't have sub-tables
        if (!commentTables.length) {
            commentTables = commentTree.querySelectorAll('tr.athing');
        }

        const nodeList = new Array(commentTables.length + 1);
        nodeList[0] = { id: 'root', level: 0, children: [] };
        let nodeIndex = 1;

        // record the OP so we can color their name orange
        const originalPosterEl = document.querySelector('.subtext a[href^="user?id="]');
        const originalPoster = originalPosterEl ? originalPosterEl.textContent : '';
        if (originalPosterEl) {
            originalPosterEl.classList.add('original_poster');
        }

        for (const t of commentTables) {
            const
                id = t.parentElement.parentElement.id || t.id,
                upVoteEl = document.getElementById(`up_${id}`),
                upVoteUrl = upVoteEl ? upVoteEl.href : '',
                downVoteEl = document.getElementById(`down_${id}`),
                downVoteUrl = downVoteEl ? downVoteEl.href : '',
                unVoteEl = document.getElementById(`un_${id}`),
                unVoteUrl = unVoteEl ? unVoteEl.href : '',
                isUpVoted = Boolean(upVoteEl && upVoteEl.classList.contains('nosee')),
                isDownVoted = Boolean(downVoteEl && downVoteEl.classList.contains('nosee')),
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
                userFontEl = userEl ? userEl.querySelector('font') : null,
                userColor = userFontEl ? userFontEl.getAttribute('color') : '',
                isNoob = userColor === '#3c963c',
                isOP = username === originalPoster,
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
            };
        }
        return nodeList;
    }

    nodeListToTree(nodeList) {
        const s = [], m = { root: nodeList[0] };
        for (let i = 0, j = 1; j < nodeList.length && nodeList[j]; i++, j++) {
            const p = nodeList[i], c = nodeList[j];
            if (c.level > p.level) s.push(p.id);
            for (let x = 0; x < p.level - c.level; x++) s.pop();
            c.parent = m[s[s.length - 1]] || nodeList[0];
            m[c.parent.id].children.push(c);
            m[c.id] = c;
        }
        return m;
    }

    renderComment(c, into) {
        const
            oddOrEven = c.level % 2 ? 'odd' : 'even',
            clone = document.importNode(this.commentTemplate.content, true),
            commentEl = clone.firstElementChild,
            upvoterEl = commentEl.querySelector('.upvoter'),
            downvoterEl = commentEl.querySelector('.downvoter'),
            unvoterEl = commentEl.querySelector('.unvoter'),
            parentEl = commentEl.querySelector('.parent'),
            authorEl = commentEl.querySelector('.author a'),
            tagImageEl = commentEl.querySelector('.hnes-tag'),
            voteblockEl = commentEl.querySelector('.voteblock');

        c.el = commentEl;

        tagImageEl.src = chrome.runtime.getURL('/images/tag.svg');

        commentEl.id = c.id;
        commentEl.classList.add(`level-${oddOrEven}`);
        commentEl.querySelector('.age').textContent = c.age;
        if (c.descCount > 0) {
            commentEl.querySelector('.reply-count').textContent = `(${c.descCount} repl${c.descCount === 1 ? 'y' : 'ies'})`;
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

        if (c.level === 1) {
            parentEl.remove();
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
        if (!c.upVoteUrl) { upvoterEl.classList.add('voted'); }
        if (!c.downVoteUrl) {
            downvoterEl.classList.add('voted');
            upvoterEl.classList.add('nodownvote');
        }

        if (c.isUpVoted || c.isDownVoted) {
            upvoterEl.classList.add('voted');
            downvoterEl.classList.add('voted');
        }
        // track the direction of this user's active vote so unvote can undo it correctly
        if (c.isUpVoted) { c.myVote = 1; }
        else if (c.isDownVoted) { c.myVote = -1; }
        else { c.myVote = null; }
        if (c.unVoteUrl) {
            voteblockEl.classList.add('voted');
            unvoterEl.classList.add('voted');
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
            commentEl.querySelector('.score').textContent = `${c.score} by`;
            commentEl.querySelector('.score').classList.add('visible');
        }

        commentEl.querySelector('.text').append(...c.textParts);

        // vote and collapse interactions are delegated (see apply()) so a
        // 1651-comment thread does not attach 4 listeners per comment

        this.renderComments(c.children, commentEl.querySelector('.replies'));
        into.appendChild(clone);
    }

    renderComments(comments, into) {
        for (const c of comments) {
            this.renderComment(c, into);
        }
    }

    static extractUnvoteUrl(html, id) {
        // matches vote?id=N&how=un... whether the href was &amp;-encoded,
        // &-raw, single- or double-quoted; returns null when absent
        const m = html.match(new RegExp(`vote\\?id=${id}(?:&amp;|&)how=un[^\\s'"<>]*`));
        if (!m) return null;
        const dom = new DOMParser().parseFromString(`<!doctype html><body>${m[0]}`, 'text/html');
        return dom.body.textContent;
    }

    voteRequest(c, direction) {
        // direction: 1 upvote, -1 downvote, 0 unvote
        const url = direction === 1 ? c.upVoteUrl : direction === -1 ? c.downVoteUrl : c.unVoteUrl;
        if (!url) return;
        const commentEl = c.el;

        fetch(url)
            .then((resp) => resp.text())
            .then(async (html) => {
                if (direction === 0) {
                    // undo in the opposite direction of the active vote: -1 for upvote, +1 for downvote
                    await HN.upvoteUserData(c.username, -c.myVote);
                    c.myVote = null;
                    // only show up/down vote if we have urls (for logged out users or low karma)
                    if (c.upVoteUrl) commentEl.querySelector('.upvoter').classList.remove('voted');
                    if (c.downVoteUrl) commentEl.querySelector('.downvoter').classList.remove('voted');
                    commentEl.querySelector('.unvoter').classList.remove('voted');
                    commentEl.querySelector('.voteblock').classList.remove('voted');
                    return;
                }

                // after voting, retrieve the new unvote link from the response;
                // a login/expired reply has none — fall back to letting HN show it
                const unVoteUrl = HNComments.extractUnvoteUrl(html, c.id);
                if (!unVoteUrl) {
                    window.location.href = url;
                    return;
                }
                c.unVoteUrl = unVoteUrl;
                commentEl.querySelector('a.unvote').href = c.unVoteUrl;

                await HN.upvoteUserData(c.username, direction);
                c.myVote = direction;
                commentEl.querySelector('.upvoter').classList.add('voted');
                commentEl.querySelector('.downvoter').classList.add('voted');
                commentEl.querySelector('.unvoter').classList.add('voted');
                commentEl.querySelector('.voteblock').classList.add('voted');
            })
            .catch(() => {
                // transient failure — let HN render its own response
                window.location.href = url;
            });
    }

    collapse(c) {
        c.isCollapsed = !c.isCollapsed;
        c.isDirty = true;
        c.el.classList.toggle('collapsed', c.isCollapsed);
        const collapserEl = c.el.querySelector(':scope > header > .collapser');
        if (collapserEl) collapserEl.setAttribute('aria-expanded', c.isCollapsed ? 'false' : 'true');
        this.storeMeta();
    }

    getMeta() {
        const now = Date.now();
        const toStore = {};
        preorder(this.nodeMap.root, (n) => {
            if (n.isDirty) toStore[n.id] = { isCollapsed: n.isCollapsed, t: now };
        });
        return toStore;
    }

    storeMeta() {
        chrome.storage.local.set(this.getMeta());
    }

    async loadMeta(nodeMap) {
        const keys = [];
        preorder(nodeMap.root, (n) => keys.push(n.id));
        const items = await chrome.storage.local.get(keys);
        // drop and delete stale entries so collapse state cannot accumulate forever
        const now = Date.now();
        const meta = {};
        const expired = [];
        for (const k of keys) {
            const m = items[k];
            if (!m) continue;
            if (typeof m === 'object' && typeof m.t === 'number' && now - m.t <= HN.COLLAPSE_TTL_MS) {
                meta[k] = m;
            } else {
                expired.push(k);
            }
        }
        if (expired.length) chrome.storage.local.remove(expired);
        return meta;
    }

    async prepare(nodeMap) {
        const meta = await this.loadMeta(nodeMap);
        const visit = (n) => {
            let acc = 0;
            for (const child of n.children) {
                acc += visit(child);
            }
            const res = acc + n.children.length;
            n.descCount = res;
            n.isCollapsed = Boolean(meta[n.id] && meta[n.id].isCollapsed);
            return res;
        };
        visit(nodeMap.root);
        return nodeMap;
    }

    async apply() {
        let commentTree = document.querySelector('#hnmain table.comment-tree');
        const itemList = document.querySelector('#hnmain table.itemlist');
        const threadList = document.querySelector('#hnmain table.comments-table');
        if (!commentTree && !itemList && !threadList) {
            console.warn('unrecognized markup detected, no commentTree, itemList, or threadList');
            return;
        } else if (itemList) {
            commentTree = itemList;
        } else if (threadList) {
            commentTree = threadList;
        }

        this.nodeMap = await this.prepare(this.nodeListToTree(this.markupToNodeList(commentTree)));
        const commentsContainer = document.createElement('div');
        commentsContainer.id = 'hnes-comments';

        try {
            this.wireDelegation(commentsContainer);
            this.renderComments(this.nodeMap.root.children, commentsContainer);
            commentTree.parentNode.replaceChild(commentsContainer, commentTree);
            if (itemList) {
                commentsContainer.classList.add('nolevels');
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
            const loading = document.getElementById('loading_comments');
            if (loading) loading.classList.add('hidden');
        }
    }

    wireDelegation(container) {
        if (this._wired) return;
        this._wired = true;
        const commentFor = (target) => {
            const commentEl = target.closest('.hnes-comment');
            return commentEl ? this.nodeMap[commentEl.id] : null;
        };

        // handlers keep `this` = matched element (see util.js on());
        // reach the instance through the closure instead
        const self = this;
        on(container, 'click', '.collapser', function(e) {
            e.preventDefault();
            const c = commentFor(this);
            if (c) self.collapse(c);
        });
        on(container, 'click', 'a.upvote', function(e) {
            e.preventDefault();
            const c = commentFor(this);
            if (c && c.upVoteUrl) self.voteRequest(c, 1);
        });
        on(container, 'click', 'a.downvote', function(e) {
            e.preventDefault();
            const c = commentFor(this);
            if (c && c.downVoteUrl) self.voteRequest(c, -1);
        });
        on(container, 'click', 'a.unvote', function(e) {
            e.preventDefault();
            const c = commentFor(this);
            if (c && c.unVoteUrl) self.voteRequest(c, 0);
        });
        // keyboard support for the collapser (role=button, tabindex=0)
        container.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const target = e.target;
            if (!target.closest || !target.closest('.collapser')) return;
            e.preventDefault();
            const c = commentFor(target);
            if (c) this.collapse(c);
        });
    }
}

function preorder(n, visit) {
    if (!n) return;
    if (visit(n)) return;
    for (const child of n.children) {
        preorder(child, visit);
    }
}

const HN = {
    init() {
        HN.pruneStorage();
        HN.initElements();
        HN.removeNumbers();

        if (window.location.pathname !== '/changepw') {
            HN.rewriteNavigation();
        }

        //if user is logged in
        const logoutElems = $contains('.pagetop a', 'logout');
        if (logoutElems.length) {
            HN.rewriteUserNav(logoutElems[0].parentElement);
        }

        let pathname = window.location.pathname;
        //More link - can be post index, threads, comments, etc
        //threads is like "etcet's comments"
        //comment listings are like "New Comments"
        //add comment after logging in is "Hacker News | Add Comment"
        if (pathname === '/x') {
            const title = document.title;
            const words = title.split(' ');
            if (words[1] === 'Comments') {
                //normal comments - fallthrough
            }
            else if (words[1] === 'comments') {
                //paginated comments, anything other than first page of comments
                //"more comments | Hacker News"
                if (words[0] === 'more') {
                    pathname = '/more';
                }
                //"user's comments | Hacker News"
                else {
                    pathname = '/threads';
                }
            }
            else if (words[0] === 'Edit') {
                pathname = '/edit';
            }
            else if (title === 'Hacker News | Confirm') {
                pathname = '/confirm';
            }
            else if (title === 'Hacker News | Add Comment') {
                pathname = '/reply';
            }
            else if (HN.isLoginPage()) {
                pathname = '/login';
            }
            else {
                pathname = '/news';
                //postlist
            }
        }

        const postPagesRE = /^(?:\/|\/news|\/newest|\/best|\/active|\/classic|\/submitted|\/saved|\/jobs|\/noobstories|\/ask|\/news2|\/over|\/show|\/shownew|\/hidden|\/upvoted)$/;
        if (postPagesRE.test(pathname)) {
            HN.doPostsList();

            if (pathname === '/jobs') {
                document.body.id = 'jobs-body';
            }
            if (pathname === '/show' || pathname === '/jobs') {
                // current HN markup: the blurb is a leading <div> inside the
                // content cell, above the story table — restyle it in place
                // instead of guessing at text rows (which now eats subtexts)
                const blurbDiv = $('#content > td > div');
                if (blurbDiv) {
                    const blurbEl = el('p', 'blurb');
                    blurbEl.append(...blurbDiv.childNodes);
                    const contentTable = $('#content > td > table');
                    if (contentTable) {
                        contentTable.insertAdjacentElement('beforebegin', blurbEl);
                    }
                    blurbDiv.remove();
                }
            }
        }
        else if (pathname === '/edit') {
            document.body.id = 'edit-body';
            const editTd = $('tr:nth-child(3) td td:first-child');
            if (editTd) editTd.remove();
        }
        else if (pathname === '/item' ||
            pathname === '/more' ||
            pathname === '/bestcomments' ||
            pathname === '/noobcomments' ||
            pathname === '/newcomments') {

            const morelink = document.querySelector('.morelink');
            if (morelink) {
                $('#content').insertAdjacentElement('afterend', morelink);
            }

            HN.hnComments = new HNComments();
            HN.doCommentsList(pathname);
        }
        else if (pathname === '/favorites' ||
            pathname === '/upvoted') {
            for (const selector of ["td[colspan='2']", '.votelinks', '.ind']) {
                $$(selector).forEach((node) => { node.style.display = 'none'; });
            }
        }
        else if (pathname === '/threads') {
            document.body.id = 'threads-body';

            //create new table and try to emulate /item
            const trs = $$('body > center > table > tbody > tr');
            const comments = trs.slice(2, -1);
            const newtable = createEl('<table><tbody></tbody></table>').firstElementChild;
            newtable.querySelector('tbody').append(...comments);
            const secondTd = trs[1] ? trs[1].querySelector('td') : null;
            if (secondTd) secondTd.appendChild(newtable);

            const morelink = document.querySelector('.morelink');
            if (morelink) {
                newtable.parentElement.appendChild(morelink);
            }

            HN.hnComments = new HNComments();
            HN.doCommentsList(pathname);
        }
        else if (pathname === '/user') {
            HN.doUserProfile();
        }
        else if (pathname === '/newslogin' ||
            pathname === '/login') {
            HN.doLogin();
        }
        else if ((pathname === '/reply') && HN.isLoginPage()) {
            HN.doLogin(); // reply when not logged in
        }
        else if ((pathname === '/submit') && HN.isLoginPage()) {
            HN.doLogin(); // submit when not logged in
        }
        else if (pathname === '/newpoll') {
            HN.doPoll();
        }
        else {
            //make sure More link is in correct place
            $contains('.title', 'More').forEach((titleEl) => {
                const prev = titleEl.previousElementSibling;
                if (prev) prev.setAttribute('colspan', '1');
            });
        }
    },

    doPoll() {
        document.body.id = 'poll-body';
    },

    isLoginPage() {
        return $contains('b', 'Login').length > 0;
    },

    initElements() {
        let header = $('body > center > table > tbody > tr:first-child');
        const headerTd = header ? header.querySelector('td') : null;
        if (headerTd && headerTd.getAttribute('bgcolor') === '#000000') {
            //mourning
            header = header.nextElementSibling;
            header.previousElementSibling.remove();
            document.body.classList.add('mourning');
        }
        if (header) header.id = 'header';

        let contentIndex = 2;
        const allTrs = $$('body > center > table > tbody > tr');
        if (allTrs[1] && allTrs[1].querySelector('.pagetop')) {
            // There's an announcement underneath header
            contentIndex++;
        }

        const content = allTrs[contentIndex];
        if (content) content.id = 'content';

        //remove empty tr element between header and content
        const emptyTr = allTrs[contentIndex - 1];
        if (emptyTr) emptyTr.remove();

        $$('#header table td').forEach((td) => td.removeAttribute('style'));

        const lastTitle = $('tr:last-child .title');
        if (lastTitle) lastTitle.id = 'more';

        $$('tr[style="height:7px"], tr[style="height:2px"]').forEach((node) => node.remove());

        $$('.yclinks').forEach((node) => {
            const parent = node.parentElement;
            if (parent && parent.tagName === 'CENTER') {
                parent.style.width = '100%';
            }
        });

        HN.setSearchInput($('input[name="q"]'), 'hn.algolia.com');

        const icon = $('img[src="y18.gif"], img[src="y18.svg"]');
        if (icon) {
            const iconParent = icon.parentElement;
            if (iconParent) iconParent.setAttribute('href', 'http://news.ycombinator.com/');
            icon.setAttribute('title', 'Hacker News');
        }
    },

    injectCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'news.css';
        document.head.appendChild(link);
    },

    COLLAPSE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // collapse state expires after 30 days

    async pruneStorage() {
        // enforces the expiry that used to live in the (never registered)
        // background script: drop thread-info entries whose expire timestamp
        // has passed and legacy collapse markers without a timestamp
        const items = await chrome.storage.local.get(null);
        const now = Date.now();
        const expired = Object.keys(items).filter((k) => {
            const v = items[k];
            let o = null;
            if (typeof v === 'string') {
                try { o = JSON.parse(v); } catch { return false; }
            }
            else if (v && typeof v === 'object') {
                o = v;
            }
            if (!o || typeof o !== 'object') return false;
            if (typeof o.expire === 'number') return o.expire < now;
            if ('isCollapsed' in o) return typeof o.t !== 'number';
            return false;
        });
        if (expired.length) await chrome.storage.local.remove(expired);
    },

    parseUserInfo(raw) {
        // storage values are JSON strings; very old versions stored a bare
        // number ('1') which must migrate to {votes: 1}
        let info = null;
        if (typeof raw === 'number') info = raw;
        else if (typeof raw === 'string') {
            try { info = JSON.parse(raw); } catch { info = null; }
        }
        else if (raw && typeof raw === 'object') info = raw;
        if (typeof info === 'number') return { votes: info };
        if (info && typeof info === 'object' && !Array.isArray(info)) return info;
        return {};
    },

    doLogin() {
        document.body.id = 'login-body';
        document.title = 'Login | Hacker News';

        HN.injectCSS();

        // save and remove (to be re-added later) any rogue messages outside of any tag (e.g. "Bad login.")
        let message = '';
        const rogueNodes = Array.from(document.body.childNodes).filter((n) => n.nodeType === 3);
        rogueNodes.forEach((n) => {
            message += n.nodeValue;
            n.remove();
        });
        message = message.trim();

        const recoverPasswordLink = $('body > a');
        if (recoverPasswordLink) recoverPasswordLink.remove();

        // remove login header, submit button (will be re-added later)
        const firstB = $('body > b');
        if (firstB) firstB.remove();
        const submitBtn = $('form input[type="submit"]');
        const buttonHtml = submitBtn ? submitBtn.outerHTML : '';
        if (submitBtn) submitBtn.remove();

        const headerHtml = '<tr id="header"><td bgcolor="#ff6600"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px"><tbody><tr><td><a href="http://ycombinator.com"><img src="y18.svg" width="18" height="18" style="border:1px #ffffff solid;"></a></td><td><span class="pagetop" id="top-navigation"><span class="nav-links"><span><a href="/news" class="top" title="Top stories">top</a>|</span><span><a href="/newest" class="new" title="Newest stories">new</a>|</span><span><a href="/best" class="best" title="Best stories">best</a></span></span></span></td></tr></tbody></table></td></tr>';

        // wrap content into a table
        const loginForm = $('body > form');
        if (loginForm) {
            loginForm.id = 'login-form';
            // wrap form in <tr id="content"><td>...</td></tr>
            const contentTr = createEl('<tr id="content"><td></td></tr>').firstElementChild;
            const contentTd = contentTr.querySelector('td');
            loginForm.parentNode.insertBefore(contentTr, loginForm);
            contentTd.appendChild(loginForm);
            // wrap content tr in <table>
            const contentTable = createEl('<table border="0" cellpadding="0" cellspacing="0" width="85%"></table>').firstElementChild;
            contentTr.parentNode.insertBefore(contentTable, contentTr);
            contentTable.appendChild(contentTr);

            // add header table row and submit button row
            contentTr.insertAdjacentHTML('beforebegin', headerHtml);
            const lastTrInForm = loginForm.querySelector('tr:last-child');
            if (lastTrInForm) {
                lastTrInForm.insertAdjacentHTML('afterend', `<tr><td></td><td>${buttonHtml}</td></tr>`);
            }

            // wrap all tables in <center>
            $$('table').forEach((table) => {
                if (table.parentElement !== document.body) return;
                const center = document.createElement('center');
                table.parentNode.insertBefore(center, table);
                center.appendChild(table);
            });

            loginForm.insertAdjacentHTML('beforebegin', '<h1>Login</h1>');

            if (recoverPasswordLink) {
                loginForm.insertAdjacentElement('beforebegin', recoverPasswordLink);
            }

            // re-add rogue messages previously removed (as text — the
            // message is scraped page content, never markup)
            if (message) {
                const h1 = $('tr#content > td:first > h1');
                if (h1) {
                    const msgEl = el('p');
                    msgEl.id = 'login-msg';
                    msgEl.textContent = ` ${message}`;
                    h1.insertAdjacentElement('beforebegin', msgEl);
                }
            }
        }

        // register?
        if ($contains('b', 'Create Account').length > 0) {
            HN.doCreateAccount();
        }
    },

    doCreateAccount() {
        // first check if doLogin() has already built a login prompt,
        // then check if there is another form present (e.g. Create Account)
        if (!$('body#login-body')) return;
        const bodyForm = $('body > form');
        if (!bodyForm) return;

        // save and remove title/form
        const formB = $('body > b');
        if (formB) formB.remove();
        bodyForm.id = 'register-form';
        const formContent = bodyForm.outerHTML;
        bodyForm.remove();

        // rebuild title/form inside the existing table
        const contentLastTd = $('tr#content > td:last-child');
        if (contentLastTd) {
            contentLastTd.insertAdjacentHTML('beforeend', formContent);
            const regForm = $('#register-form');
            if (regForm) {
                const submitEl = $('#register-form > input[type="submit"]');
                const buttonHtml = submitEl ? submitEl.outerHTML : '';
                if (submitEl) submitEl.remove();
                const lastTr = regForm.querySelector('tr:last-child');
                if (lastTr) lastTr.insertAdjacentHTML('afterend', `<tr><td></td><td>${buttonHtml}</td></tr>`);
                regForm.insertAdjacentHTML('beforebegin', '<h1>Create Account</h1>');
            }
        }
    },

    doPostsList() {
        document.body.id = 'index-body';

        HN.initKeys();
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

    doCommentsList(pathname) {
        //add classes to comment page header (OP post) and the table containing all the comments
        let comments;

        const belowHeader = $$('#content table');

        if (belowHeader[1]) {
            const loadingP = createEl("<p id='loading_comments'>Loading comments</p>").firstElementChild;
            belowHeader[1].insertAdjacentElement('beforebegin', loadingP);
        }

        if (pathname === '/item') {
            document.body.id = 'item-body';
            if (belowHeader[0]) belowHeader[0].classList.add('item-header');

            comments = belowHeader[1];
            if (comments) comments.classList.add('comments-table');

            const poll = $('.item-header table');
            if (poll) {
                HN.graphPoll(poll);
            }

            //linkify self-post text
            const selfPost = $('.item-header tr:nth-child(3)');
            if (selfPost) {
                selfPost.classList.add('self-post-text');
                linkify(selfPost);
            }

            //fix spacing issue #86
            $$('.item-header td').forEach((td) => td.removeAttribute('colspan'));

            //fixes issue #121 (indent on individual comment pages)
            $$(".item-header td[class='ind']").forEach((node) => node.remove());

            // move reply button to new line.
            $$(".item-header input[type='submit']").forEach((node) => { node.style.display = 'block'; });

            const more = $('.morelink');
            //recursively load more pages on closed thread
            // Always call loadMoreLink — it handles the no-morelink case
            // by calling doAfterCommentsLoad() directly
            HN.loadMoreLink(more);
        }
        else { // threads
            document.body.id = 'threads-body';
            comments = belowHeader[0];
            if (comments) comments.classList.add('comment-tree');
            HN.doAfterCommentsLoad();
        }

        //do not want to track comments on 'more' pages
        //TODO: infinite scroll and tracking on 'more' pages
    },

    doUserProfile() {
        const contentTd = $('#content > td');
        if (contentTd) contentTd.id = 'user-profile';

        const options = $$('#user-profile tr > td[valign="top"]');
        const [, , karma, about] = options;

        if (options.length === 4) {
            //other user pages
            const submittedLink = $('#user-profile a[href^="submitted"]');
            if (submittedLink && submittedLink.parentElement) {
                submittedLink.parentElement.id = 'others-profile-submitted';
            }
            if (about) {
                const aboutNext = about.nextElementSibling;
                if (aboutNext) linkify(aboutNext);
            }
        }
        else {
            //your user page
            const userProfile = $('#user-profile');
            if (userProfile) userProfile.classList.add('your-profile');
            const email = options[4];
            const showdead = options[5];
            const noprocrast = options[6];
            const maxvisit = options[7];
            const minaway = options[8];
            let delay;
            if ($contains('tr > td[valign="top"]', 'topcolor:').length) {
                const topcolor = options[9];
                if (topcolor) {
                    topcolor.classList.add('select-option');
                    const topNext = topcolor.nextElementSibling;
                    if (topNext) topNext.appendChild(createEl('<span>Default: ff6600</span>').firstElementChild);
                }
                delay = options[10];
            }
            else {
                delay = options[11];
            }

            //fix spacing
            [email, showdead, noprocrast, maxvisit, minaway, delay].forEach((optionEl) => {
                if (optionEl) optionEl.classList.add('select-option');
            });
            const changepwLink = $('#user-profile a[href="changepw"]');
            if (changepwLink && changepwLink.parentElement) {
                changepwLink.parentElement.id = 'your-profile-change-password';
            }

            const karmaNext = karma ? karma.nextElementSibling : null;
            const currentKarma = karmaNext ? parseInt(karmaNext.textContent, 10) : 0;
            const karmaForFlag = 21;
            const karmaForPolls = 201;
            const karmaForDownvotes = 501;
            const canFlagMsg = currentKarma < karmaForFlag
                ? createEl(`<p>You need ${karmaForFlag - currentKarma} more karma until you can flag posts.</p>`).firstElementChild
                : createEl('<p>You can flag posts.</p>').firstElementChild;
            const canCreatePollsMsg = currentKarma < karmaForPolls
                ? createEl(`<p>You need ${karmaForPolls - currentKarma} more karma until you can create a poll.</p>`).firstElementChild
                : createEl('<p>You can <a href="//news.ycombinator.com/newpoll">create a poll</a>.</p>').firstElementChild;
            const canDownvoteMsg = currentKarma < karmaForDownvotes
                ? createEl(`<p>You need ${karmaForDownvotes - currentKarma} more karma until you can downvote comments.</p>`).firstElementChild
                : createEl('<p>You can downvote comments.</p>').firstElementChild;
            if (karmaNext) {
                karmaNext.append(canFlagMsg, canCreatePollsMsg, canDownvoteMsg);
            }

            if (about) {
                const aboutNext2 = about.nextElementSibling;
                if (aboutNext2) {
                    const aboutHelp = aboutNext2.querySelector('a[href="formatdoc"]');
                    if (aboutHelp) {
                        aboutHelp.addEventListener('click', (e) => {
                            e.preventDefault();
                            const inputHelp = aboutNext2.querySelector('.input-help');
                            if (inputHelp) {
                                inputHelp.remove();
                            }
                            else {
                                aboutNext2.appendChild(HN.getFormattingHelp());
                            }
                        });
                    }
                }
            }

            const appendDefault = (optionEl, text, help) => {
                const next = optionEl ? optionEl.nextElementSibling : null;
                if (!next) return;
                const span = el('span');
                span.textContent = `Default: ${text}`;
                next.appendChild(span);
                if (help) {
                    const p = el('p');
                    p.textContent = help;
                    next.appendChild(p);
                }
            };
            appendDefault(showdead, 'no',
                'Showdead allows you to see all the submissions and comments that have been killed by the editors.');
            appendDefault(noprocrast, 'no',
                "Noprocast is a way to prevent yourself from spending too much time on Hacker News. If you turn it on you'll only be allowed to visit the site for maxvisit minutes at a time, with gaps of minaway minutes in between.");
            appendDefault(maxvisit, '20');
            appendDefault(minaway, '180');
            appendDefault(delay, '0',
                'Delay allows you to delay the public posting of comments you make for delay minutes.');

            //redirect to profile page after updating, instead of /x page
            const updateBtn = $('input[value="update"]');
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    chrome.storage.local.set({ update_profile: window.location.href });
                });
            }
        }
    },

    getFormattingHelp() {
        const wrapper = el('div', 'input-help');
        wrapper.innerHTML = '<p>Blank lines separate paragraphs.</p>' +
            '<p>Text after a blank line that is indented by two or more spaces is reproduced verbatim (this is intended for code).</p>' +
            "<p>Text surrounded by asterisks is italicized, if the character after the first asterisk isn't whitespace.</p>";
        return wrapper;
    },

    graphPoll(poll) {
        const pollMaxWidth = 500;
        const pollScores = poll ? $$('.default', poll) : [];
        const totalscore = pollScores.reduce((sum, scoreEl) => sum + Number(scoreEl.textContent.split(' ')[0]), 0);
        pollScores.forEach((scoreEl) => {
            const score = Number(scoreEl.textContent.split(' ')[0]);
            if (score > 0) {
                const width = Math.max(1, score / totalscore * pollMaxWidth);
                const graphEl = createEl('<tr><td></td><td><div class="poll-graph"></div></td></tr>').firstElementChild;
                graphEl.querySelector('div').style.width = `${width}px`;
                scoreEl.parentElement.insertAdjacentElement('afterend', graphEl);
            }
        });
    },

    async loadMoreLink(elem) {
        if (!elem) {
            await HN.doAfterCommentsLoad();
            return;
        }

        const loading = document.getElementById('loading_comments');
        if (loading) {
            loading.textContent += '.';
        }

        const moreurl = elem.getAttribute('href');
        try {
            const resp = await fetch(moreurl);
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('center > table > tbody > tr:nth-child(3) > td > table > tbody > tr');
            const commentsTbody = $('.comments-table > tbody');
            if (commentsTbody) {
                for (const row of rows) {
                    commentsTbody.appendChild(document.importNode(row, true));
                }
            }
            $$('.morelink').forEach((node) => node.remove());
            const morelink = $contains('.title a[rel="nofollow"]', 'More')[0];
            if (morelink) {
                await HN.loadMoreLink(morelink);
            } else {
                await HN.doAfterCommentsLoad();
            }
        } catch {
            // fetch failed — render what we already have instead of hanging on "Loading"
            await HN.doAfterCommentsLoad();
        }
    },

    async doAfterCommentsLoad() {
        await HN.hnComments.apply();
        const loading = document.getElementById('loading_comments');
        if (loading) {
            loading.textContent = 'Rendering comments...';
        }
    },

    async addInfoToUsers() {
        const authorEls = $$('.author a');
        const usernames = authorEls.map((a) => a.textContent);

        const userData = await chrome.storage.local.get(usernames);
        for (let i = 0; i < authorEls.length; i++) {
            const authorEl = authorEls[i];
            const name = usernames[i];
            const rawInfo = userData[name];

            if (rawInfo === undefined || rawInfo === null) continue;
            const info = HN.parseUserInfo(rawInfo);

            // migrate the legacy bare-number format in place
            if (typeof rawInfo === 'number' || /^\s*-?\d+(\.\d+)?\s*$/.test(String(rawInfo))) {
                chrome.storage.local.set({ [name]: JSON.stringify(info) });
            }

            // display user tag and score
            if (info.tag) HN.displayUserTag(authorEl, info.tag);
            if (info.votes) HN.displayUserScore(authorEl, info.votes);
        }

        on(document, 'click', '.hnes-tag, .hnes-tagText', (e) => {
            // delegated so that the event applies to all elements generated in the future
            HN.editUserTag(e);
        });

        on(document, 'keyup', '.hnes-tagEdit', function(e) {
            const input = this;
            const parent = input.parentElement;
            const gp = parent ? parent.parentElement : null;

            const finishEdit = () => {
                if (parent) parent.classList.remove('edit');
                input.remove();
            };

            if (e.key === 'Enter') {
                if (gp) {
                    const authorEl = gp.querySelector('a');
                    const author = authorEl ? authorEl.textContent : '';
                    HN.setUserTag(author, input.value);
                }
                finishEdit();
            }
            if (e.key === 'Escape') {
                finishEdit();
            }
        });
    },

    async upvoteUserData(author, value) { // Adds value to the user's upvote count, saves and displays it.
        const stored = await chrome.storage.local.get(author);
        const userInfo = HN.parseUserInfo(stored[author]);
        const newTotal = value + (typeof userInfo.votes === 'number' ? userInfo.votes : 0);

        if (newTotal === 0) {
            delete userInfo.votes;
        }
        else {
            userInfo.votes = newTotal;
        }
        await chrome.storage.local.set({ [author]: JSON.stringify(userInfo) });
        HN.showNewUserScore(author, newTotal); // Set the upvote count
    },

    authorEls(author) {
        // exact username match — 'arc' must never hit 'arcfour'
        return $$('.author').filter((authorEl) => {
            const a = authorEl.querySelector('a');
            return a && a.textContent === author;
        });
    },

    showNewUserScore(author, value) {
        for (const authorEl of HN.authorEls(author)) {
            const scoreEl = authorEl.querySelector('.hnes-user-score');
            if (scoreEl) {
                if (value !== 0) {
                    scoreEl.textContent = value;
                    scoreEl.parentElement.classList.remove('noscore');
                } else {
                    scoreEl.parentElement.classList.add('noscore');
                }
            }
        }
    },

    displayUserScore(authorLinkEl, upvotes) {
        const userscoreEl = authorLinkEl.parentElement.querySelector('.hnes-user-score');
        if (userscoreEl) {
            userscoreEl.textContent = upvotes;
            userscoreEl.parentElement.classList.remove('noscore');
        }
    },

    displayUserTag(authorLinkEl, tag) {
        if (!tag) return;
        const tagTextEl = authorLinkEl.parentElement.querySelector('.hnes-tagText');
        if (tagTextEl) tagTextEl.textContent = tag;
    },

    editUserTag(e) {
        const target = e.target || e;
        const parent = target.parentElement;
        if (!parent) return;
        // the tag input is created on demand — one per editing session,
        // not one per rendered comment
        let tagEdit = parent.querySelector('.hnes-tagEdit');
        if (!tagEdit) {
            tagEdit = el('input', 'hnes-tagEdit');
            tagEdit.type = 'text';
            parent.appendChild(tagEdit);
        }
        parent.classList.add('edit');
        tagEdit.focus();
    },

    async setUserTag(author, tag) {
        const stored = await chrome.storage.local.get(author);
        const userInfo = HN.parseUserInfo(stored[author]);

        if (tag !== '') {
            userInfo.tag = tag;
        }
        else {
            delete userInfo.tag;
        }

        await chrome.storage.local.set({ [author]: JSON.stringify(userInfo) });

        for (const commenter of HN.authorEls(author)) {
            const tagText = commenter.querySelector('.hnes-tagText');
            if (tagText) tagText.textContent = tag;
        }
    },

    removeNumbers() {
        $$('td[align="right"]').forEach((node) => node.remove());
    },

    collectActions(subtext) {
        // collect action links into hnes-actions span
        const actionsSpan = el('span', 'hnes-actions');
        const selectors = ['a[href^="flag"]', 'a[href^="vouch"]',
            'a[href^="https://hn.algolia.com/?query="]', 'a[href^="hide"]',
            'a[href^="https://www.google.com/search?q="]', 'a[href^="fave"]'];
        for (const selector of selectors) {
            actionsSpan.append(...subtext.querySelectorAll(selector));
        }
        return actionsSpan;
    },

    formatScore() {
        $$('.subtext').forEach((subtext) => {
            let score = subtext.querySelector('span.score');
            const by = subtext.querySelector('a[href^="user?id="]');
            const at = subtext.querySelector('span.age a');

            // find the real 'n comments' / 'discuss' link — it is not
            // necessarily the last anchor (logged-in rows end with
            // hide/past/favorite)
            let comments = Array.from(subtext.querySelectorAll('a')).findLast((a) => {
                const href = a.getAttribute('href') || '';
                const text = a.textContent.trim();
                return /^item\?id=\d+/.test(href) && (text === 'discuss' || /\d\s*comments?/.test(text));
            }) || null;

            // scoreless, comment-less rows (e.g. job posts): transformed rows
            // form a 4-column grid [comments, score, votelinks, title] with the
            // subtext row removed and its age/actions inlined into the title
            // cell. Do the same here so job rows stay single-line: pad the row
            // to the grid, inline age + action links, drop the native subtext.
            if (!score && !comments) {
                const titleRow = subtext.parentElement.previousElementSibling;
                if (titleRow && titleRow.children.length === 2 &&
                        !titleRow.querySelector('.votelinks')) {
                    titleRow.insertBefore(
                        createEl('<td colspan="2"></td>').firstElementChild,
                        titleRow.firstChild);
                }
                const jobTitleTd = titleRow ? titleRow.querySelector('td.title') : null;
                if (jobTitleTd) {
                    const jobAgeSpan = el('span', 'hnes-age');
                    if (at) jobAgeSpan.textContent = at.textContent;
                    jobTitleTd.append(jobAgeSpan, HN.collectActions(subtext));
                }
                const jobSpacer = subtext.parentElement.nextElementSibling;
                if (jobSpacer && jobSpacer.children.length === 0) jobSpacer.remove();
                subtext.parentElement.remove();
                return;
            }

            if (!score) {
                score = el('span');
                score.textContent = '0';
            }
            else {
                // note: only the points span is rewritten — the surrounding
                // .subline must survive so hide/flag/favorite stay reachable
                score.textContent = parseInt(score.textContent, 10);
            }
            score.classList.add('score');
            score.setAttribute('title', 'Points');

            const commentsLink = comments ? comments.getAttribute('href')
                : (at ? at.getAttribute('href') : '');

            if (!comments || comments.textContent.trim() === 'discuss') {
                const newComments = el('a');
                newComments.textContent = '0';
                newComments.setAttribute('href', commentsLink);
                comments = newComments;
            }
            else {
                comments.textContent = parseInt(comments.textContent, 10) || '-';
            }

            comments.setAttribute('href', commentsLink);
            comments.classList.add('comments');
            comments.setAttribute('title', 'Comments');

            let byEl;
            if (!by) {
                byEl = el('span');
            }
            else {
                by.setAttribute('title', 'View profile');
                byEl = el('span', 'submitter');
                byEl.textContent = 'by ';
                byEl.appendChild(by);
            }

            const scoreEl = el('td', 'hnes-score-col');
            scoreEl.appendChild(score);
            const commentsEl = el('td', 'hnes-comments-col');
            commentsEl.appendChild(comments);

            const parent = subtext.parentElement;
            const prev = parent ? parent.previousElementSibling : null;
            if (prev) {
                prev.insertBefore(scoreEl, prev.firstChild);
                prev.insertBefore(commentsEl, prev.firstChild);
                const titleEl = prev.querySelector('.title');
                if (titleEl) titleEl.appendChild(byEl);
            }
            if (parent) {
                // drop the row's empty spacer row (HN emits height:5px
                // spacers); never remove a row that carries content
                const next = parent.nextElementSibling;
                if (next && next.children.length === 0) next.remove();
                parent.remove();
            }

            // collect action links into hnes-actions span
            const actionsSpan = HN.collectActions(subtext);
            if (byEl.parentElement) {
                byEl.insertAdjacentElement('afterend', actionsSpan);
            }

            const ageSpan = el('span', 'hnes-age');
            if (at) ageSpan.textContent = at.textContent;
            if (byEl.parentElement) {
                byEl.insertAdjacentElement('afterend', ageSpan);
            }
        });
    },

    formatURL() {
        $$('.comhead').forEach((comhead) => {
            const text = comhead.textContent;
            const urlEl = el('span');
            urlEl.textContent = text.substring(2, text.length - 1);
            const leftParen = el('span', 'paren');
            leftParen.textContent = '(';
            const rightParen = el('span', 'paren');
            rightParen.textContent = ')';
            comhead.textContent = '';
            comhead.append(leftParen, urlEl, rightParen);
        });
    },

    moveMoreLink() {
        const more = $('#more');
        if (more && more.previousElementSibling) {
            more.previousElementSibling.setAttribute('colspan', '3');
        }
    },

    rewriteUserNav(pagetop) {
        const userLinks = el('span', 'nav-links');
        const as = pagetop.querySelectorAll('a');
        const userProfile = as[0];
        const logout = as[1];
        const userName = userProfile ? userProfile.textContent : '';

        const userDrop = createEl('<span class="more-arrow" id="my-more-link" title="Toggle user links"><a href="#"></a></span>').firstElementChild;
        userDrop.querySelector('a').textContent = userName;

        // detach logout and user_profile
        if (logout) logout.remove();
        if (userProfile) userProfile.remove();
        const matches = /\(([^)]+)\)/.exec(pagetop.textContent);
        const score = matches ? matches[1] : '';

        const scoreElem = el('span');
        scoreElem.textContent = '|';
        const karmaSpan = el('span');
        karmaSpan.id = 'my-karma';
        karmaSpan.title = 'Your karma';
        karmaSpan.textContent = score;
        scoreElem.appendChild(karmaSpan);
        userLinks.appendChild(scoreElem);
        pagetop.textContent = '';
        userLinks.insertBefore(userDrop, userLinks.firstChild);
        pagetop.appendChild(userLinks);

        const hiddenDiv = el('div', 'nav-drop-down');
        hiddenDiv.id = 'user-hidden';
        const userPages = [
            ['profile', '/user', 'Your profile and settings'],
            ['comments', '/threads', 'Your comments and replies'],
            ['submitted', '/submitted', "Stories you've submitted"],
            ['upvoted', '/upvoted', "Stories you've voted for"],
            ['favorites', '/favorites', "Stories you've favorited"]
        ];
        let newActive = null;
        for (const [linkText, linkHref, linkTitle] of userPages) {
            const link = el('a');
            link.textContent = linkText;
            link.setAttribute('href', `${linkHref}?id=${userName}`);
            link.setAttribute('title', linkTitle);

            if (window.location.pathname === linkHref) {
                newActive = link.cloneNode(true);
                newActive.classList.add('nav-active-link', 'new-active-link');
            }

            hiddenDiv.appendChild(link);
        }
        if (newActive) {
            const idMatch = window.location.search.match(/id=(\w+)/);
            let userId = idMatch ? idMatch[1] : '';
            userId = userId === userName ? 'Your' : `${userId}'s`;
            newActive.textContent = `${userId} ${newActive.textContent}`;
            const navLinks = $('#top-navigation .nav-links');
            if (navLinks) {
                const activeSpan = el('span');
                activeSpan.textContent = '|';
                activeSpan.appendChild(newActive);
                navLinks.appendChild(activeSpan);
            }
        }

        if (logout) {
            logout.id = 'user-logout';
            logout.setAttribute('title', 'Logout');
            hiddenDiv.appendChild(logout);
        }
        userLinks.appendChild(hiddenDiv);

        const userDropToggle = () => {
            const dropA = userDrop.querySelector('a');
            if (dropA) dropA.classList.toggle('active');
            hiddenDiv.style.display = (hiddenDiv.style.display === 'none') ? 'block' : 'none';
        };
        userDrop.addEventListener('click', userDropToggle);
        hiddenDiv.addEventListener('click', userDropToggle);
        hiddenDiv.style.display = 'none';
        HN.setTopColor();
    },

    rewriteNavigation() {
        let topsel = $('.topsel');
        const navigation = $('td:nth-child(2) .pagetop');
        if (navigation) navigation.id = 'top-navigation';

        const visiblePages = [
            ['top', '/news', 'Top stories'],
            ['new', '/newest', 'Newest stories'],
            ['best', '/best', 'Best stories'],
            ['submit', '/submit', 'Submit a story'],
        ];

        const hiddenPages = [
            ['show', '/show', 'Show HN'],
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
            topsel = el('span', 'nav-links');
            if (navigation) navigation.appendChild(topsel);
        }
        else {
            topsel.classList.remove('topsel');
            topsel.classList.add('nav-links');
            topsel.textContent = '';
        }
        for (const [linkText, linkHref, linkTitle] of visiblePages) {
            const span = el('span');
            span.textContent = '|';
            const newLink = el('a', linkText);
            newLink.setAttribute('href', linkHref);
            newLink.textContent = linkText;
            newLink.setAttribute('title', linkTitle);

            if (window.location.pathname === linkHref) {
                newLink.classList.add('nav-active-link');
            }

            span.insertBefore(newLink, span.firstChild);
            topsel.appendChild(span);
        }
        if (window.location.pathname === '/') {
            const topLink = $('.top');
            if (topLink) topLink.classList.add('nav-active-link');
        }

        const moreLink = createEl('<span class="more-arrow" id="nav-more-link" title="Toggle more links"><a href="#">more</a></span>').firstElementChild;
        const hiddenDiv = el('div', 'nav-drop-down');
        hiddenDiv.id = 'nav-others';

        let newActive = null;
        for (const [linkText, linkHref, linkTitle] of hiddenPages) {
            const newLink = el('a', linkText);
            newLink.setAttribute('href', linkHref);
            newLink.setAttribute('title', linkTitle);
            newLink.textContent = linkText;

            if (window.location.pathname === linkHref) {
                newActive = newLink.cloneNode(true);
                newActive.classList.add('nav-active-link', 'new-active-link');
            }

            hiddenDiv.appendChild(newLink);
        }

        topsel.append(moreLink, hiddenDiv);

        if (newActive) {
            const activeSpan = el('span');
            activeSpan.textContent = '|';
            activeSpan.appendChild(newActive);
            topsel.appendChild(activeSpan);
        }

        if (navigation) {
            navigation.textContent = '';
            navigation.appendChild(topsel);
        }

        const toggleMoreLink = () => {
            const moreA = moreLink.querySelector('a');
            if (moreA) moreA.classList.toggle('active');
            hiddenDiv.style.display = (hiddenDiv.style.display === 'none') ? 'block' : 'none';
        };
        moreLink.addEventListener('click', toggleMoreLink);
        hiddenDiv.addEventListener('click', toggleMoreLink);

        hiddenDiv.style.left = `${moreLink.offsetLeft}px`;
        hiddenDiv.style.display = 'none';
    },

    setTopColor() {
        const header = document.getElementById('header');
        if (!header) return;
        const topcolor = header.children[0].getAttribute('bgcolor');
        if (topcolor && topcolor.toLowerCase() !== '#ff6600') {
            header.style.backgroundColor = topcolor;
            $$('.nav-drop-down').forEach((node) => { node.style.backgroundColor = topcolor; });
        }
    },

    setSearchInput(inputEl, domain) {
        // a real placeholder — the old value-hack submitted
        // "Search on hn.algolia.com" as the query when unfocused
        if (inputEl) inputEl.setAttribute('placeholder', `Search on ${domain}`);
    },

    initKeys() {
        document.addEventListener('keydown', (e) => {
            // never hijack browser/OS shortcuts (⌘C must copy, not open tabs)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // or typing in any field
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                      t.tagName === 'SELECT' || t.isContentEditable)) return;

            switch (e.key && e.key.toLowerCase()) {
                case 'j': HN.nextStory(); break;             // Next item
                case 'k': HN.previousStory(); break;         // Previous item
                case 'l': HN.openStory(true); break;         // Open story in new tab
                case 'o': HN.openStory(false); break;
                case 'p': HN.viewComments(false); break;
                case 'c': HN.viewComments(true); break;
                case 'b':                                    // Both, in new tabs
                    HN.viewComments(true);
                    HN.openStory(true);
                    break;
            }
        });
    },

    nextStory() {
        HN.nextOrPrevStory(true);
    },
    previousStory() {
        HN.nextOrPrevStory(false);
    },

    nextOrPrevStory(next) {
        const current = $('.on_story');
        if (!current) {
            if (next) {
                const firstTr = $('#content tr:first-child');
                if (firstTr) firstTr.classList.add('on_story');
            }
        } else {
            const nextEl = next ? current.nextElementSibling : current.previousElementSibling;
            if (nextEl) {
                nextEl.classList.add('on_story');
                window.scrollTo(0, nextEl.offsetTop - 10);
                current.classList.remove('on_story');
            }
        }
    },

    openStory(newTab) {
        const story = $('.on_story .title .titleline > a');
        if (story) {
            if (newTab) {
                const titleEl = $('.on_story .title');
                if (titleEl) titleEl.classList.add('link-highlight');
                window.open(story.getAttribute('href'));
            }
            else {
                window.location = story.getAttribute('href');
            }
        }
    },

    viewComments(newTab) {
        const comments = $('.on_story .comments');
        if (comments) {
            if (newTab) {
                window.open(comments.getAttribute('href'));
            }
            else {
                window.location = comments.getAttribute('href');
            }
        }
    },

    getAndRateStories() {
        const NO_HEAT = 50;
        const MILD = 75;
        const MEDIUM = 99;
        $$('.score').forEach((scoreEl) => {
            const score = parseInt(scoreEl.textContent, 10);

            if (score < NO_HEAT) {
                scoreEl.classList.add('no-heat');
            } else if (score < MILD) {
                scoreEl.classList.add('mild');
            } else if (score < MEDIUM) {
                scoreEl.classList.add('medium');
            } else {
                scoreEl.classList.add('hot');
            }
        });
    },

    enableLinkHighlighting() {
        $$('.title a:link').forEach((link) => {
            link.addEventListener('click', () => {
                const td = link.closest('td');
                if (td) td.classList.add('link-highlight');
            });
        });
    }
};


//show new comment count on hckrnews.com
if (window.location.host === 'hckrnews.com') {
    $$('.entries li').forEach((li) => {
        const id = Number(li.getAttribute('id'));
        chrome.storage.local.get(String(id)).then((result) => {
            const raw = result[String(id)];
            if (raw != null) {
                const data = JSON.parse(raw);
                const num = data.num ? data.num : 0;
                const idEl = document.getElementById(data.id);
                if (idEl) {
                    const commentsEl = idEl.querySelector('.comments');
                    if (commentsEl) {
                        const now = Number(commentsEl.textContent);
                        const unread = Math.max(now - num, 0);
                        const prepend = unread === 0 ? `${unread} / ` : `<span>${unread}</span> / `;
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

    const onReady = (fn) => {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    };

    onReady(async () => {
        try {
            if (document.body.textContent.includes('Unknown or expired link.')) {
                await chrome.storage.local.set({ expired: true });
                window.location.replace('/');
                return;
            }
            else {
                const { expired } = await chrome.storage.local.get('expired');
                if (expired) {
                    const headerEl = document.getElementById('header');
                    if (headerEl) {
                        headerEl.insertAdjacentHTML('afterend', '<p id="alert">You reached an <a href="//news.ycombinator.com/item?id=17705" title="what?">expired page</a> and have been redirected back to the front page.</p>');
                    }
                    await chrome.storage.local.set({ expired: false });
                }
            }

            //redirect to profile page after updating it
            if (window.location.pathname === '/x') {
                const { update_profile: updateProfile } = await chrome.storage.local.get('update_profile');
                if (updateProfile) {
                    await chrome.storage.local.set({ update_profile: false });
                    window.location.replace(updateProfile);
                }
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
