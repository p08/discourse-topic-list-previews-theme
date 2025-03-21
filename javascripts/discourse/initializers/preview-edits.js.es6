import discourseComputed, {
  on,
  observes,
} from 'discourse-common/utils/decorators';
import {alias, and, equal, not} from '@ember/object/computed';
import DiscourseURL from 'discourse/lib/url';
import {
  testImageUrl,
  animateHeart,
  getDefaultThumbnail,
} from '../lib/tlp-utilities';
import {addLike, sendBookmark, removeLike} from '../lib/actions';
import {withPluginApi} from 'discourse/lib/plugin-api';
import PostsCountColumn from 'discourse/raw-views/list/posts-count-column';
import {resizeAllGridItems} from '../lib/gridupdate';
import Settings from '../mixins/settings';
import Topic from 'discourse/models/topic';
import loadScript from 'discourse/lib/load-script';
import { cookAsync } from 'discourse/lib/text';
import { debounce } from '@ember/runloop';
import { inject as service } from "@ember/service";

export default {
  name: 'preview-edits',
  initialize (container) {
    withPluginApi ('0.8.40', api => {
      api.onPageChange (() => {
        loadScript (
          'https://www.rivoq.com/uploads/default/assets/imagesloaded.pkgd.min.js'
        ).then (() => {
          $ ('.tiles-grid').imagesLoaded (resizeAllGridItems ());
        });
      });

      api.modifyClass ('component:load-more', {
        init () {
          this._super (...arguments);
          if (this.class == 'paginated-topics-list') {
            this.set ('eyelineSelector', '.topic-list-item');
          } else {
            this.set ('eyelineSelector', this.selector);
          }
        },
      });

      api.modifyClass ('component:basic-topic-list', Settings);

      api.modifyClass ('component:basic-topic-list', {
        router: service('router'),
        classNameBindings: [
          'showThumbnail',
          'showExcerpt',
          'showActions',
          'tilesStyle',
        ],
        currentRoute: alias ('router.currentRouteName'),
        listChanged: false,

        skipHeader () {
          this.get ('tilesStyle') || this.get ('site.mobileView');
        },

        @discourseComputed ('listChanged')
        tilesStyle () {
          this._settingEnabled ('topic_list_tiles');
        },
      });

      api.modifyClass ('component:topic-list', Settings);

      api.modifyClass ('component:topic-list', {
        router: service('router'),
        currentRoute: alias ('router.currentRouteName'),
        classNameBindings: [
          'showThumbnail',
          'showExcerpt',
          'showActions',
          'tilesStyle',
        ],
        listChanged: false,

        @on ('init')
        setup () {
          const suggestedList = this.get ('suggestedList');
          if (suggestedList) {
            const category = this.get (
              'parentView.parentView.parentView.topic.category'
            );
            this.set ('category', category);
          }
          if (settings.topic_list_fade_in_time) {
            $ ('#list-area').fadeOut (0);
          }
        },

        @on ('didRender')
        completeRender () {
          if (this.get ('tilesStyle')) {
            Ember.run.scheduleOnce ('afterRender', this, this.applyTiles);
          }
          if (settings.topic_list_fade_in_time) {
            $ ('#list-area').fadeIn (
              settings.topic_list_fade_in_time
            );
          }
        },

        @on ('didInsertElement')
        @observes ('currentRoute')
        setupListChanged () {
          this.toggleProperty ('listChanged');
        },

        @on ('didInsertElement')
        @observes ('tilesStyle')
        setupListStyle () {
          if (!this.$ ()) {
            return;
          }
          if (this.get ('tilesStyle')) {
            this.$ ().parents ('#list-area').toggleClass ('tiles-style', true);
            this.$ ('tbody').toggleClass ('tiles-grid', true);
          }
        },

        @discourseComputed ('listChanged')
        routeShortName () {
          return this.get ('router').currentRouteName.split ('.')[0];
        },

        @discourseComputed ('routeShortName')
        discoveryList () {
          return this.get ('routeShortName') == 'discovery';
        },

        @discourseComputed ('routeShortName')
        suggestedList () {
          return this.get ('routeShortName') == 'topic';
        },

        @on ('willDestroyElement')
        _tearDown () {
          this.$ ().parents ('#list-area').removeClass ('tiles-style');
          this.$ ('tbody').removeClass ('tiles-grid');
        },

        @discourseComputed ('listChanged')
        tilesStyle () {
          return this._settingEnabled ('topic_list_tiles');
        },

        @discourseComputed ('listChanged')
        showThumbnail () {
          return this._settingEnabled ('topic_list_thumbnails');
        },

        @discourseComputed ('listChanged')
        showExcerpt () {
          return this._settingEnabled ('topic_list_excerpts');
        },

        @discourseComputed ('listChanged')
        showActions () {
          return this._settingEnabled ('topic_list_actions');
        },

        @discourseComputed ('listChanged')
        skipHeader () {
          return this.get ('tilesStyle') || this.get ('site.mobileView');
        },

        @discourseComputed ('listChanged')
        thumbnailFirstXRows () {
          return settings.topic_list_thumbnail_first_x_rows;
        },

        applyTiles () {
          resizeAllGridItems ();
        },
      });

      api.modifyClass ('component:topic-list-item', {
        canBookmark: Ember.computed.bool ('currentUser'),
        rerenderTriggers: [
          'bulkSelectEnabled',
          'topic.pinned',
          'likeDifference',
          'topic.thumbnails',
        ],
        tilesStyle: alias ('parentView.tilesStyle'),
        notTilesStyle: not ('parentView.tilesStyle'),
        showThumbnail: and ('thumbnails', 'parentView.showThumbnail'),
        showExcerpt: and ('topic.excerpt', 'parentView.showExcerpt'),
        showActions: and ('topic.sidecar_installed', 'parentView.showActions'),
        thumbnailFirstXRows: alias ('parentView.thumbnailFirstXRows'),
        category: alias ('parentView.category'),
        currentRoute: alias ('parentView.currentRoute'),

        // Lifecyle logic

        @on ('init')
        _setupProperties () {
          const topic = this.get ('topic');
          const thumbnails = topic.get ('thumbnails');
          const defaultThumbnail = this.get ('defaultThumbnail');

          if (this.get ('tilesStyle')) {
            // needs 'div's for masonry
            this.set ('tagName', 'div');
            this.classNames = ['tiles-grid-item'];

            if (
              settings.topic_list_tiles_larger_featured_tiles &&
              topic.tags
            ) {
              if (
                topic.tags.filter (
                  tag => this.get ('featuredTags').indexOf (tag) > -1
                )[0]
              ) {
                this.classNames.push ('tiles-grid-item-width2');
              }
            }
            const raw = topic.excerpt
            cookAsync(raw).then((cooked) => this.set('excerpt', cooked));
          }

          if (thumbnails) {
            testImageUrl (thumbnails, imageLoaded => {
              if (!imageLoaded) {
                Ember.run.scheduleOnce ('afterRender', this, () => {
                  if (defaultThumbnail) {
                    const $thumbnail = this.$ ('img.thumbnail');
                    if ($thumbnail) $thumbnail.attr ('src', defaultThumbnail);
                  } else {
                    const $container = this.$ ('.topic-thumbnail');
                    if ($container) $container.hide ();
                  }
                });
              }
            });
          } else if (
            defaultThumbnail &&
            settings.topic_list_default_thumbnail_fallback
          ) {
            this.set ('thumbnails', [{url: defaultThumbnail}]);
          }

          const obj = PostsCountColumn.create ({topic});
          obj.siteSettings = settings
          this.set ('likesHeat', obj.get ('likesHeat'));
        },

        @on ('didInsertElement')
        _setupDOM () {
          const topic = this.get ('topic');
          if (
            topic.get ('thumbnails') &&
            this.get ('thumbnailFirstXRows') &&
            this.$ ().index () > this.get ('thumbnailFirstXRows')
          ) {
            this.set ('showThumbnail', false);
          }
          this._afterRender ();
        },

        @observes ('thumbnails')
        _afterRender () {
          Ember.run.scheduleOnce ('afterRender', this, () => {
            this._setupTitleCSS ();
            if (this.get ('showExcerpt') && !this.get ('tilesStyle')) {
              this._setupExcerptClick ();
            }
            if (this.get ('showActions')) {
              this._setupActions ();
            }
          });
        },

        @discourseComputed
        featuredTags () {
          return settings.topic_list_featured_images_tag.split (
            '|'
          );
        },

        _setupTitleCSS () {
          let $el = this.$ ('.topic-title a.visited');
          if ($el) {
            $el.closest ('.topic-details').addClass ('visited');
          }
        },

        _setupExcerptClick () {
          this.$ ('.topic-excerpt').on ('click.topic-excerpt', () => {
            DiscourseURL.routeTo (this.get ('topic.lastReadUrl'));
          });
        },

        _sizeThumbnails () {
          this.$ ('.topic-thumbnail img').on ('load', function () {
            $ (this).css ({
              width: $ (this)[0].naturalWidth,
            });
          });
        },

        _setupActions () {

          if (this._state === 'destroying') return;

          let postId = this.get ('topic.topic_post_id'),
            $bookmark = this.$ ('.topic-bookmark'),
            $like = this.$ ('.topic-like');

          $bookmark.on ('click.topic-bookmark', () => {
            this.debouncedToggleBookmark ();
          });

          $like.on ('click.topic-like', () => {
            if (this.get ('currentUser')) {
              this.toggleLike ($like, postId);
            } else {
              const controller = container.lookup ('controller:application');
              controller.send ('showLogin');
            }
          });
        },

        @on ('willDestroyElement')
        _tearDown () {
          this.$ ('.topic-excerpt').off ('click.topic-excerpt');
          this.$ ('.topic-bookmark').off ('click.topic-bookmark');
          this.$ ('.topic-like').off ('click.topic-like');
        },

        // Overrides

        @discourseComputed ()
        expandPinned () {
          if (this.get ('showExcerpt')) {
            return true;
          }
          return this._super ();
        },

        // Display objects

        @discourseComputed ()
        posterNames () {
          let posters = this.get ('topic.posters');
          let posterNames = '';
          posters.forEach ((poster, i) => {
            let name = poster.user.name
              ? poster.user.name
              : poster.user.username;
            posterNames +=
              '<a href="' +
              poster.user.path +
              '" data-user-card="' +
              poster.user.username +
              '" + class="' +
              poster.extras +
              '">' +
              name +
              '</a>';
            if (i === posters.length - 2) {
              posterNames += '<span> & </span>';
            } else if (i !== posters.length - 1) {
              posterNames += '<span>, </span>';
            }
          });
          return posterNames;
        },

        @discourseComputed ('topic.thumbnails')
        thumbnails () {
          return this.get ('topic.thumbnails');
        },

        @discourseComputed
        defaultThumbnail () {
          return getDefaultThumbnail ();
        },

        @discourseComputed ('tilesStyle', 'thumbnailWidth', 'thumbnailHeight')
        thumbnailOpts (tilesStyle, thumbnailWidth, thumbnailHeight) {
          let opts = {
            tilesStyle,
          };

          if (thumbnailWidth) {
            opts['thumbnailWidth'] = thumbnailWidth;
          }

          if (thumbnailHeight) {
            opts['thumbnailHeight'] = thumbnailHeight;
          }

          return opts;
        },

        @discourseComputed ('likeCount')
        topicActions (likeCount) {
          let actions = [];
          if (
            likeCount ||
            this.get ('topic.topic_post_can_like') ||
            !this.get ('currentUser') ||
            settings.topic_list_show_like_on_current_users_posts
          ) {
            actions.push (this._likeButton ());
          }
          if (this.get ('canBookmark')) {
            actions.push (this._bookmarkButton ());
            Ember.run.scheduleOnce ('afterRender', this, () => {
              let $bookmarkStatus = this.$ ('.topic-statuses .op-bookmark');
              if ($bookmarkStatus) {
                $bookmarkStatus.hide ();
              }
            });
          }
          return actions;
        },

        @discourseComputed ('likeDifference')
        likeCount (likeDifference) {
          return (
            (likeDifference == null
              ? this.get ('topic.topic_post_like_count')
              : likeDifference) || 0
          );
        },

        @discourseComputed ('hasLiked')
        hasLikedDisplay () {
          let hasLiked = this.get ('hasLiked');
          return hasLiked == null
            ? this.get ('topic.topic_post_liked')
            : hasLiked;
        },

        @discourseComputed ('category', 'topic.isPinnedUncategorized')
        showCategoryBadge (category, isPinnedUncategorized) {
          const isTopic = typeof topic !== 'undefined';
          return (
            (isTopic || !category || category.has_children) &&
            !isPinnedUncategorized
          );
        },

        changeLikeCount (change) {
          let count = this.get ('likeCount'), newCount = count + (change || 0);
          this.set ('hasLiked', Boolean (change > 0));
          this.set ('likeDifference', newCount);
          this.renderTopicListItem ();
          this._afterRender ();
        },

        _likeButton () {
          let classes = 'topic-like';
          let disabled = this.get ('topic.topic_post_is_current_users');

          if (this.get ('hasLikedDisplay')) {
            classes += ' has-like';
            let unlikeDisabled = this.get ('topic.topic_post_can_unlike')
              ? false
              : this.get ('likeDifference') == null;
            disabled = disabled ? true : unlikeDisabled;
          }

          return {
            class: classes,
            title: 'post.controls.like',
            icon: 'heart',
            disabled: disabled,
          };
        },

        _bookmarkButton () {
          var classes = 'topic-bookmark', title = 'bookmarks.not_bookmarked';
          if (this.get ('topic.topic_post_bookmarked')) {
            classes += ' bookmarked';
            title = 'bookmarks.created';
          }
          return {class: classes, title: title, icon: 'bookmark'};
        },

        // Action toggles and server methods

        toggleBookmark () {
          let $bookmark = this.$ ('.topic-bookmark');
          sendBookmark (this.topic, !$bookmark.hasClass ('bookmarked'));
          $bookmark.toggleClass ('bookmarked');
        },

        debouncedToggleBookmark () {
          Ember.run.debounce(this, this.toggleBookmark, 500);
        },

        toggleLike ($like, postId) {
          if (this.get ('hasLikedDisplay')) {
            removeLike (postId);
            this.changeLikeCount (-1);
          } else {
            const scale = [1.0, 1.5];
            return new Ember.RSVP.Promise (resolve => {
              animateHeart ($like, scale[0], scale[1], () => {
                animateHeart ($like, scale[1], scale[0], () => {
                  addLike (postId);
                  this.changeLikeCount (1);
                  resolve ();
                });
              });
            });
          }
        },

        debouncedToggleLike () {
          Ember.run.debounce(this, this.toggleLike, 500);
        },
      });


      api.modifyClass ('component:topic-timeline', {
        @on ('didInsertElement')
        refreshTimelinePosition () {
          this.appEvents.on ('topic:refresh-timeline-position', this, () =>
            this.queueDockCheck ()
          );
        },

        @on ('willDestroyElement')
        removeRefreshTimelinePosition () {
          try {
            this.appEvents.off ('topic:refresh-timeline-position', this, () =>
              this.queueDockCheck ()
            );
          } catch (err) {
            console.log (err.message);
          }
        },
      });
    });
  },
};
