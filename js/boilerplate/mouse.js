/**
 * Handles mouse motion/tracking, scrolling, and dragging.
 *
 * @ignore
 */

/**
 * @property
 *   Whether an {@link Actor} is being dragged.
 *
 * Drop targets can change how they look when a draggable object is hovered
 * over them by testing `this.isHovered() && App.isSomethingBeingDragged` in
 * their {@link Box#draw draw()} methods.
 *
 * @member App
 * @static
 */
App.isSomethingBeingDragged = false;

/**
 * Handles mouse motion and scrolling.
 * @static
 */
var Mouse = {
    /**
     * @property
     *   The coordinates of the mouse relative to the upper-left corner of the
     *   canvas. If you want the coordinates of the mouse relative to the
     *   world, add `world.xOffset` and `world.yOffset` to the `x` and `y`
     *   coordinates, respectively.
     * @static
     */
    coords: {x: -9999, y: -9999},
};

// Track mouse events
jQuery(document).ready(function() {
  // Callback for mouse/touch-move event to track cursor location
  var trackmove = function(e) {
    try {
      // Get the cursor location
      var x = e.pageX || e.originalEvent.touches[0].pageX;
      var y = e.pageY || e.originalEvent.touches[0].pageY;
      // Prevent window scrolling on iPhone and display freeze on Android
      if (e.type == 'touchmove') {
        e.preventDefault();
      }
      // The position we want is relative to the canvas
      Mouse.coords = {
          x: x - $canvas.offset().left,
          y: y - $canvas.offset().top,
      };
    }
    catch(ex) {
      if (window.console && console.error) {
        console.error('Unable to track cursor location. ' + ex);
      }
    }
  };

  // Track cursor for touches
  $canvas.on('touchmove.coords', trackmove);
  // For mice, only track the cursor when it's over the canvas
  $canvas.hover(function() {
    jQuery(this).on('mousemove.coords', trackmove);
  }, function() {
    jQuery(this).off('mousemove.coords');
    Mouse.coords = {x: -9999, y: -9999};
  });

  // Track and delegate click events
  $canvas.on('mousedown mouseup click touchstart touchend', function(e) {
    if (e.type == 'touchstart') {
      trackmove(e);
    }
    if (isAnimating() && typeof App.Events !== 'undefined') {
      App.Events.trigger(e.type, e);
    }
  });

  // Track and delegate dragend events
  $canvas.on('mouseup.drag touchend.drag', function(e) {
    if (typeof App.Events !== 'undefined') {
      App.Events.trigger('canvasdragstop', e);
    }
    App.isSomethingBeingDragged = false;
    /**
     * @event canvasdragstop
     *   Fires on the document when the player stops dragging an object,
     *   i.e. when the player releases the mouse or stops touching the canvas.
     * @member global
     */
    jQuery(document).trigger('canvasdragstop');
  });

  // Track and delegate drop events
  jQuery(document).on('canvasdrop', function(e, target) {
    if (typeof App.Events !== 'undefined') {
      App.Events.trigger('canvasdrop', e, target);
    }
  });
});

/**
 * Determine whether the mouse is hovering over an object.
 *
 * The object in question must have these properties: `x`, `y`, `width`,
 * `height`. (All {@link Box}es have these properties.)
 *
 * @param {Box} obj
 *   The object to check.
 *
 * @return {Boolean}
 *   Whether the mouse is hovering over the object.
 *
 * @member App
 * @static
 */
App.isHovered = function(obj) {
  var offsets = world.getOffsets(),
      xPos = obj.x - offsets.x,
      yPos = obj.y - offsets.y;
  return Mouse.coords.x > xPos && Mouse.coords.x < xPos + obj.width &&
      Mouse.coords.y > yPos && Mouse.coords.y < yPos + obj.height;
};

/**
 * @class Mouse.Scroll
 *   Encapsulates mouse position scrolling.
 *
 * Note that mouse scrolling will be temporarily paused while the mouse is down
 * to avoid scrolling while the user is trying to select something.
 *
 * @static
 */
Mouse.Scroll = (function() {
  var THRESHOLD = 0.2, MOVEAMOUNT = 350;
  // Whether we're allowed to mouse scroll
  var enabled = false;
  // If enabled is true, then whether the mouse is over the canvas
  var hovered = false;
  // Whether we're currently scrolling
  var translating = false;
  // How far we scrolled last time
  var scrolled = {x: 0, y: 0};
  // Available easing functions
  var easings = {
      THRESHOLD: function() { return 1; },
      LINEAR: function(val) { return 1-val; },
      SMOOTH: function(val) { return 0.5 - Math.cos( (1-val)*Math.PI ) / 2; },
      EXPONENTIAL: function(val) { return Math.sqrt(1-val); },
  }
  // The currently active easing function
  var easing = easings.SMOOTH;

  function translate() {
    var ma, gradient, initialTranslationState = translating;

    // Left
    if (Mouse.coords.x < canvas.width * THRESHOLD) {
      gradient = easing(Mouse.coords.x / (canvas.width * THRESHOLD));
      ma = Math.round(gradient*Math.min(world.xOffset, MOVEAMOUNT * App.physicsDelta));
      world.xOffset -= ma;
      scrolled.x -= ma;
      context.translate(ma, 0);
    }
    // Right
    else if (Mouse.coords.x > canvas.width * (1-THRESHOLD)) {
      gradient = easing((canvas.width - Mouse.coords.x) / (canvas.width * THRESHOLD));
      ma = Math.round(gradient*Math.min(world.width - canvas.width - world.xOffset, MOVEAMOUNT * App.physicsDelta));
      world.xOffset += ma;
      scrolled.x += ma;
      context.translate(-ma, 0);
    }

    // Up
    if (Mouse.coords.y < canvas.height * THRESHOLD) {
      gradient = easing(Mouse.coords.y / (canvas.height * THRESHOLD));
      ma = Math.round(gradient*Math.min(world.yOffset, MOVEAMOUNT * App.physicsDelta));
      world.yOffset -= ma;
      scrolled.y -= ma;
      context.translate(0, ma);
    }
    // Down
    else if (Mouse.coords.y > canvas.height * (1-THRESHOLD)) {
      gradient = easing((canvas.height - Mouse.coords.y) / (canvas.height * THRESHOLD));
      ma = Math.round(gradient*Math.min(world.height - canvas.height - world.yOffset, MOVEAMOUNT * App.physicsDelta));
      world.yOffset += ma;
      scrolled.y += ma;
      context.translate(0, -ma);
    }

    // We're not translating if we're not moving.
    translating = scrolled.x !== 0 && scrolled.y !== 0;

    // We weren't scrolling. Now we are. Fire the relevant event.
    if (!initialTranslationState && translating) {
      /**
       * @event mousescrollon
       *   Fires on the document when the viewport starts scrolling. Binding
       *   to this event may be useful if you want to pause animation or
       *   display something while the viewport is moving.
       */
      jQuery(document).trigger('mousescrollon');
    }
    // We were scrolling. Now we're not. Fire the relevant event.
    else if (initialTranslationState && !translating) {
      /**
       * @event mousescrolloff
       *   Fires on the document when the viewport stops scrolling. Binding
       *   to this event may be useful if you want to pause animation or
       *   display something while the viewport is moving.
       */
      jQuery(document).trigger('mousescrolloff');
    }
    return scrolled;
  }
  return {
    /**
     * Enable mouse position scrolling.
     * @static
     */
    enable: function() {
      if (enabled) {
        return;
      }
      enabled = true;
      $canvas.one('mousemove.translate', function() {
        // Enable translating if we're over the canvas
        if (Mouse.coords.x >= 0 && Mouse.coords.y >= 0) {
          hovered = true;
          translate();
        }
      });
      $canvas.on('mouseenter.translate touchstart.translate', function() {
        hovered = true;
        translate();
      });
      $canvas.on('mouseleave.translate touchleave.translate', function() {
        hovered = false;
        if (translating) {
          translating = false;
          jQuery(document).trigger('mousescrolloff');
        }
      });
      var mousedown = false;
      $canvas.on('mousedown.translate touchstart.translate', function() {
        mousedown = true;
      });
      $canvas.on('mouseup.translate touchend.translate', function() {
        mousedown = false;
      });
    },
    /**
     * Disable mouse position scrolling.
     * @static
     */
    disable: function() {
      $canvas.off('.translate');
      hovered = false;
      enabled = false;
      translating = false;
    },
    /**
     * Test whether mouse position scrolling is enabled.
     * @static
     */
    isEnabled: function() {
      return enabled;
    },
    /**
     * Test whether the viewport is currently mouse-scrolling.
     *
     * There is one weird edge case: this will return true if the user is in
     * the middle of a click-and-drag action that was started while the
     * viewport was scrolling.
     *
     * @static
     */
    isScrolling: function() {
      return translating;
    },
    // Called in the core animation loop.
    _update: function() {
      // Don't scroll while dragging.
      if (hovered && !mousedown) {
        return translate();
      }
    },
    /**
     * Available easing modes for scroll movement speed.
     *
     * Modes include:
     * - THRESHOLD: Scroll at max speed when the mouse is past the threshold
     * - LINEAR: Increase scroll speed linearly as the mouse approaches an edge
     * - SMOOTH: S-curve "swing" easing (default)
     * - EXPONENTIAL: Increase scroll speed inverse-exponentially as the mouse
     *   approaches an edge (increase quickly at first, then plateau)
     */
    easings: easings,
    /**
     * Set the easing function used to determine scroll speed.
     *
     * The `easings` property contains the possible easing functions, or you
     * can define your own.
     */
    setEasingFunction: function(e) {
      easing = e;
    },
    /**
     * Get the easing function used to determine scroll speed.
     *
     * The `easings` property contains the possible easing functions.
     *
     * @static
     */
    getEasingFunction: function() {
      return easing;
    },
    /**
     * Set how close to the edge of the canvas the mouse triggers scrolling.
     *
     * The threshold is a fractional percentage [0.0-0.5) of the width of the
     * canvas. If the mouse is within this percent of the edge of the canvas,
     * the viewport attempts to scroll. The default threshold is 0.2 (20%).
     *
     * See also Mouse.Scroll.getThreshold().
     *
     * @static
     */
    setThreshold: function(t) {
      THRESHOLD = t;
    },
    /**
     * Get how close to the edge of the canvas the mouse triggers scrolling.
     *
     * See also Mouse.Scroll.getThreshold().
     *
     * @return {Number}
     *   The mouse-scrolling threshold. The threshold is a fractional
     *   percentage [0.0-0.5) of the width of the canvas. If the mouse is
     *   within this percent of the edge of the canvas, the viewport attempts
     *   to scroll. The default threshold is 0.2 (20%).
     *
     * @static
     */
    getThreshold: function() {
      return THRESHOLD;
    },
    /**
     * Set how fast the mouse will cause the viewport to scroll.
     *
     * The actual scrolling speed also depends on the easing function. The
     * scroll speed set here is actually the maximum scroll speed.
     *
     * @param {Number} a
     *   The maximum distance in pixels that the viewport will move each second
     *   while scrolling (the movement can be less when the viewport is very
     *   close to an edge of the world). Defaults to 350.
     *
     * @static
     */
    setScrollDistance: function(a) {
      MOVEAMOUNT = a;
    },
    /**
     * Get how fast the mouse will cause the viewport to scroll.
     *
     * The actual scrolling speed also depends on the easing function. The
     * scroll speed retrieved here is actually the maximum scroll speed.
     *
     * @return {Number}
     *   The maximum distance in pixels that the viewport will move each second
     *   while scrolling (the movement can be less when the viewport is very
     *   close to an edge of the world). Defaults to 350.
     *
     * @static
     */
    getScrollDistance: function() {
      return MOVEAMOUNT;
    },
  };
})();
