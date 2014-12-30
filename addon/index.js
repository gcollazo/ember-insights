/* global Ember */

var initializer = (function() {
  var Addon = new (function() { // jshint ignore:line

    this.isActivated  = false;
    this.configs      = {};
    this.settings     = null;

    var ga = function() {
      return window[Addon.settings.gaGlobalFuncName];
    };

    var tracker = function(action) {
      var command = action;
      if (Addon.settings.gaTrackerName) {
        command = Addon.settings.gaTrackerName + '.' + action;
      }
      return command;
    };

    // Runtime conveniences as wrapper for `ga` function
    this.tracker = {
      _hasGA: function() {
        return (ga() && typeof ga() === 'function');
      },
      _getGA: function() {
        if (! this._hasGA()) {
          Ember.debug("Can't find in `window` a `" + Addon.settings.gaGlobalFuncName + "` function definition");
        }
        return ga();
      },

      send: function(fieldNameObj) {
        fieldNameObj = fieldNameObj || {};
        (this._getGA())(tracker('send'), fieldNameObj);
      },
      sendEvent: function(category, action, label, value) {
        var fieldNameObj = {
          'hitType':       'event',  // Required
          'eventCategory': category, // Required
          'eventAction':   action    // Required
        };

        if (label != null) {
          fieldNameObj.eventLabel = label;
          if (value != null) {
            fieldNameObj.eventValue = value;
          }
        }

        (this._getGA())(tracker('send'), fieldNameObj);
      },
      trackPageView: function(path, fieldNameObj) {
        fieldNameObj = fieldNameObj || {};

        if (!path) {
          var loc = window.location;
          path = loc.hash ? loc.hash.substring(1) : (loc.pathname + loc.search);
        }

        (this._getGA())(tracker('send'), 'pageview', path, fieldNameObj);
      }
    };

    var defaultHandler = function(type, options, tracker) {
      var args = ['ember_' + type];

      if (type === 'transition') {
        args[1] = JSON.stringify({
          from: options.oldRouteName,
          to: options.routeName
        });

        var trackType = Addon.settings.trackTransitionsAs;

        if (trackType === 'event'    || trackType === 'both') {
          tracker.sendEvent.apply(tracker, args);
        }
        if (trackType === 'pageview' || trackType === 'both') {
          tracker.trackPageView(options.url);
        }
      }
      else if (type === 'action') {
        args[1] = options.actionName;

        var actionLabel = options.actionArguments[0],
            actionValue = options.actionArguments[1];

        if (actionLabel != null) {
          args[2] = actionLabel;
          if (actionValue != null) {
            args[3] = actionValue;
          }
        }

        tracker.sendEvent.apply(tracker, args);
      }
    };

    var firstMatchedGroup = function(toMatchAll, toMatch) {
      var groups = Addon.settings.groups;
      for (var i=0, len1=groups.length; i<len1; i++) {
        var group = groups[i];
        var resultGroup = {
          name:     group.name,
          insights: group.insights,
          handler:  group.handler || defaultHandler
        };

        var matchAllType = toMatchAll[0];
        var matchAllConfig = group.insights.getWithDefault(matchAllType, false);
        if (matchAllConfig === true) {
          return resultGroup;
        }
        else if (typeof matchAllConfig === 'object' && matchAllConfig.except) {
          if (
            (toMatchAll[1] && matchAllConfig.except.indexOf(toMatchAll[1]) > -1) ||
            (toMatchAll[2] && matchAllConfig.except.indexOf(toMatchAll[2]) > -1)
          ) {
            // Do nothing! 'except' array contains checked route or action!
          }
          else {
            return resultGroup;
          }
        }

        for (var j=0, len2=toMatch.length; j<len2; j++) {
          var path   = toMatch[j][0],
              entity = toMatch[j][1];
          if (group.insights.getWithDefault(path, []).indexOf(entity) > -1) {
            return resultGroup;
          }
        }
      }
      return false;
    };

    this.sendToGAIfMatched = function(type, options) {
      var actionName, toMatchAll, toMatch, oldRouteName, oldUrl,
          url = options.url,
          routeName = options.routeName,
          routeNameNoIndex = routeName.replace('.index', '');

      if (type === 'transition') {
        actionName = 'transition';
        oldRouteName = options.oldRouteName;
        oldUrl = options.oldUrl;
        toMatch = [
          ['TRANSITIONS', routeName       ],
          ['TRANSITIONS', routeNameNoIndex],
          ['MAP.' + routeName        + '.ACTIONS', 'TRANSITION'],
          ['MAP.' + routeNameNoIndex + '.ACTIONS', 'TRANSITION']
        ];
        toMatchAll = ['ALL_TRANSITIONS', routeName, routeNameNoIndex];
      }
      else if (type === 'action') {
        actionName = options.actionName;
        toMatch = [
          ['ACTIONS', actionName],
          ['MAP.' + routeName        + '.ACTIONS', actionName],
          ['MAP.' + routeNameNoIndex + '.ACTIONS', actionName]
        ];
        toMatchAll = ['ALL_ACTIONS', actionName];
      }

      // look for the insight declaration
      var matchedGroup = firstMatchedGroup(toMatchAll, toMatch);

      if (matchedGroup) {
        matchedGroup.handler(type, options, Addon.tracker);
      }

      // drop a line to the developer console
      if (Addon.settings.debug) {
        var msg = "TRAP" + (matchedGroup ? " (MATCHED - group '" + matchedGroup.name + "')" : '') + ": '" + actionName + "' action";
        var word = (type === 'action') ? " on '" : " to '";
        if (oldRouteName) { msg += " from '" + oldRouteName + "' route (" + oldUrl + ")"; }
        if (   routeName) { msg += word      +    routeName + "' route (" +    url + ")"; }
        Ember.debug(msg);
      }
    };

    // middleware for actions
    this.actionMiddleware = function(actionName) {
      // use original implementation if addon is not activated
      if (!Addon.isActivated) { this._super.apply(this, arguments); return; }

      var appController = this.container.lookup('controller:application');
      var routeName = appController.get('currentRouteName');

      Addon.sendToGAIfMatched('action', {
        actionName: actionName,
        actionArguments: [].slice.call(arguments, 1),
        route: this.container.lookup('route:' + routeName),
        routeName: routeName,
        url: this.container.lookup('router:main').get('url')
      });

      // bubble event back to the Ember engine
      this._super.apply(this, arguments);
    };

    // middleware for transitions
    this.transitionMiddleware = function(infos) {
      // use original implementation if addon is not activated
      if (!Addon.isActivated) { this._super.apply(this, arguments); return; }

      var appController = this.container.lookup('controller:application');

      var oldRouteName = appController.get('currentRouteName');
      var oldUrl = oldRouteName ? this.get('url') : '';
      this._super.apply(this, arguments); // bubble event back to the Ember engine
      var newRouteName = appController.get('currentRouteName');

      Ember.run.scheduleOnce('routerTransitions', this, function() {
        var newUrl = this.get('url');

        if (Addon.settings.updateDocumentLocationOnTransitions) {
          (ga())(tracker('set'), 'location', document.URL);
        }

        Addon.sendToGAIfMatched('transition', {
          route:        this.container.lookup('route:' + newRouteName),
          routeName:    newRouteName,
          oldRouteName: oldRouteName,
          url:          newUrl,
          oldUrl:       oldUrl
        });
      });
    };

  })();

  // start catching actions from ActionHandler
  Ember.ActionHandler.reopen({
    send: Addon.actionMiddleware
  });
  // start catching transitions
  Ember.Router.reopen({
    didTransition: Addon.transitionMiddleware
  });

  return {
    configure: function(env, settings) {
      // defaults
      settings.gaGlobalFuncName   = settings.gaGlobalFuncName || 'ga';
      settings.trackTransitionsAs = settings.trackTransitionsAs || 'pageview';
      if (! settings.updateDocumentLocationOnTransitions) {
        settings.updateDocumentLocationOnTransitions = true;
      }

      Addon.configs[env] = settings;
      Addon.configs[env].groups = [];
    },
    addGroup: function(env, cfg) {
      cfg.insights = Ember.Object.create(cfg.insights);
      Addon.configs[env].groups.push(cfg);
    },
    removeGroup: function(env, name) {
      var groups = Addon.configs[env].groups;

      for (var i=groups.length-1; i>=0; i--) {
        if (groups[i].name === name) {
          groups.splice(i, 1);
          return;
        }
      }
    },
    start: function(env) {
      Addon.settings = Addon.configs[env];
      Ember.assert("can't find settings for '" + env + "' environment", Addon.settings);

      Addon.isActivated = true;

      return Addon.tracker;
    },
    stop: function() {
      Addon.isActivated = false;
    }
  };

})();

export default initializer;