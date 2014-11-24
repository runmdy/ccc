
var VIS_FLAGS1 = {
    measuring:     1,
    arranging:     2,

    measureDirty:  4,
    arrangeDirty:  8,
    renderDirty:  16
};

VIS_FLAGS1.arrangeDirtyImplied = VIS_FLAGS1.arrangeDirty | VIS_FLAGS1.renderDirty;
VIS_FLAGS1.measureDirtyImplied = VIS_FLAGS1.measureDirty | VIS_FLAGS1.arrangeDirtyImplied;

// -----------------

/**
 * @name cgf.visual.Visual.Element
 * @class The base abstract class of visual element.
 * @extends cgf.dom.EntityTemplate.Element
 * @abstract
 */
cgf_visual_Visual.Element
    .init(function(parent, scene, index) {

        this.base(parent, scene, index);

        // Layout fields

        // The following two are non-null if already measured before.
        this._prefSize = null;
        this._prevAvailSize = null;

        this._flags1 = 0;

    })
    .add(/** @lends cgf.visual.Visual.Element# */{
        /**
         * Gets a value indicating if this element is a content element.
         * @type boolean
         */
        get isContent() { return false; },

        /**
         * Gets a value indicating if this element has size.
         * @type boolean
         */
        get isSized() { return false; },

        /**
         * Gets a value indicating if this element can have visual children.
         * @type boolean
         */
        get isVisualParent() { return false; },

        /**
         * Gets a value indicating if this element lays out all of its children
         * using absolute positioning.
         * @type boolean
         */
        get isPositionAbsOnly() { return true; },

        get visualParent() {
            return def.as(this.parent, cgf_visual_Visual);
        },

        /**
         * Gets the canvas of the visual tree of this element,
         * if any, or `null` if none.
         *
         * If the current element is itself a canvas element,
         * it is not returned, but its nearest ancestor canvas, if any, is.
         *
         * @type {cgf.visual.Canvas}
         * @virtual
         */
        get canvas() {
            var c = this.visualParent;
            while(c) {
                if(def.is(c, cgf_visual_Canvas)) return c;
                c = c.visualParent;
            }
            return null;
        },

        /**
         * Determines the absolute value of a number in a given unit.
         *
         * This implementation evaluates the standard visual units:
         * `"%"`, `"%w"`, `"%h"`, `"em"`, `"vw"`, `"vh"`.
         *
         * @param {number} num The number to evaluate, expressed in unit _unit_.
         * @param {number} unit The unit in which _num_ is expressed.
         *
         * @return {number} The absolute value, or `NaN`, when the unit is not defined,
         * or it cannot be evaluated in the current state.
         *
         * @override
         */
        evalUnit: function(num, unit) {
            if(!unit || !num || !isFinite(num)) return num; // 0, NaN, +Infinity, -Infinity

            // TODO: implement me
            var p;
            switch(unit) {
                case '%':
                case '%h': return (p = this.parent) ? ((num / 100) * p.layout.contentWidth ) : NaN;
                case '%v': return (p = this.parent) ? ((num / 100) * p.layout.contentHeight) : NaN;
                case 'em': return num * 10; // TODO: font size inheritance...
                // TODO: vw, vh, cw, ch ... ?
            }

            // TODO: log unknown unit.
            return NaN;
        },

        get layout() {
            return this._layoutInfo || this._calcLayout();
        },

        /**
         * Called to calculate the element's layout.
         *
         * This method is called directly from {@link cgf.Visual.Element#layout}
         * when the property {@link cgf.Visual.Element#_layoutInfo} is not set.
         * This property should be set by the end of this method's execution.
         *
         * If this element is not a layout root,
         * the layout operation is delegated to start at
         * the nearest ancestor layout root element.
         * When returning from that call,
         * it must be that the property {@link cgf.Visual.Element#_layoutInfo}
         * has been set.
         *
         * Otherwise,
         * the layout operation is started in this element,
         * by calling {@link cgf.Visual.Element#_layoutTree}.
         *
         * @return {cgf.Visual.LayoutInfo} The layout info.
         * @protected
         */
        _calcLayout: function() {
            // assert !this._layoutInfo

            // Layout property is set a priori:
            // * this prevents reentry;
            // * this allows children to refer to, for example, the parent's presumed content size,
            //   during their own layout;
            // * setting NaN values on yet unknown fields, allows to, indirectly, by NaN propagation,
            //   detect (invalid) circular dependencies.

            var vp = this.visualParent;
            if(vp)
                vp._calcLayout();
            else
                this._layoutTree();

            /*
            if(!this._layoutInfo) {
                // This means that the parent layout was already calculated, and not dirty.
                // Probably our layout had been invalidated directly.
            }

            if(!this._layoutInfoPrev) {
                // First layout.
                // Start from the root, canvas.
            }

            var li = this._layoutInfo = this._createLayoutInfo();

            this._layoutPrepare();
            */

            return this._layoutInfo;
        },

        /**
         * Called on a layout root element to perform the layout operation
         * on its layout sub-tree.
         *
         * If this is not the first layout of this element,
         * the property {@link cgf.Visual.Element#_layoutInfoPrev}
         * will contain the previous layout's layout info.
         *
         * The default implementation performs no special placement
         * of child entities.
         * However,
         * its methods {@link cgf.Visual.Element#_layoutPrepare} and
         * {@link cgf.Visual.Element#_layoutCommit} are called.
         *
         * All child elements will default to content position `0,0`.
         *
         * When the size of this element, or one of its components, is unspecified,
         * it is taken to be the size of the bounding box that
         * encompasses all the positive quadrant part of child elements' bounding boxes...
         * ???
         */
        _layoutTree: function() {
            // Being a layout root,
            // our (possibly non-existing) parent
            // gives us all the space we may need...
            var availableRefSize = {
                width:  Infinity,
                height: Infinity
            };

            this._layoutPrepare(availableRefSize);

            this._layoutEnd();
        },

        // Basic, for leaf elements.
        _layoutPrepare: function(availRefSize) {
            var li = this._layoutInfo = this._createLayoutInfo();
        },

        /**
         * Creates a layout info instance, appropriate for this element's type.
         *
         * @return {cgf.visual.Visual.LayoutInfo} The layout info.
         * @virtual
         */
        _createLayoutInfo: function() {
            var li = {},
                isSized = this.isSized,
                isPosAbs = 0,
                l, r, t, b, w, h,
                processPos, plength, liParent, size, sizeMin, sizeMax, pad;

            if(isSized) {
                size = this.size;
                w = size.width;  // may be null
                h = size.height; // idem
            } else {
                w = h = 0;
            }

            // posAbs -> any position fixed (parent-% or abs)
            //
            // both positions of same direction fixed -> implied length,
            //    but require parent length to be defined.
            //
            // if posAbs and any percent (position, size, sizeMin, sizeMax)

            if(this.isContent) {
                // Some parents (Canvas && base Panel) only support absolute positioning.
                isPosAbs = this.parent.isPositionAbsOnly;

                // Converts nulls to NaNs and registers any non-nulls.
                processPos = function(v) {
                    return v != null ? ((isPosAbs = true), v) : NaN;
                };

                li.left   = processPos((l = this.left  ));
                li.top    = processPos((t = this.top   ));
                li.right  = processPos((r = this.right ));
                li.bottom = processPos((b = this.bottom));
                li.isPositionAbs = isPosAbs;

                if(isPosAbs) {
                    liParent = this.parent.layout;

                    // The way this is being done,
                    // an abs positioned element will have no way to
                    // determine its size from its content.
                    // Also, sizeMin/Max are also not being taken into account.
                    // So, if, for example, left and right are fixed,
                    // and parent.width is not yet determined,
                    // we should only determine actual width after the element
                    // has had a chance to calculate it from its content...

                    /*
                     *                 PW=? > L + R  { W > 0 / Wmin }
                     *      |------------------------|
                     *      |---->+-----------+<-----|
                     *         L        W=?       R
                     *
                     *              [Wmin, Wmax]
                     *
                     *                  PW=?  > L2 + W2
                     *      |------------------------|
                     *      |------>+-------+<-------|
                     *         L2       W2       R2 = PW -(L2 + W2)
                     *
                     *      PW >= max_i { (Li||0) + (Wi||0) + (Ri||0) }
                     */

                    // If parent already has a fixed content width,
                    // all the envolved variables can be resolved now.
                    // Otherwise,
                    // it is only possible in a second phase,
                    // when the parent already has a fixed content width.
                    // The parent may have other children that allow him
                    // to determine a fixed width.
                    // The only thing this element is good for is to help
                    // establish the minimum size that the parent must have
                    // so that it contains all its children.
                    // If this element has a specified absolute min width,
                    // we're good to go, otherwise,
                    // determining the minimum width requires analyzing the
                    // element's own content.
                    plength = liParent.contentWidth || 0;
                    if(!isNaN(plength)) {
                        if(w == null) {
                            w = Math.max(0, plength - (li.left=l||0) - (li.right=r||0));
                        } else if(l == null) {
                            if(r == null)
                                // Center in parent
                                li.left = li.right = (plength - w) / 2;
                            else
                                li.left = plength - w - r;
                        } else /*if(r == null)*/ {
                            // When r is also defined, smash it; over-constrained.
                            li.right = plength - w - l;
                        }
                        // w,l,r are now not NaN/null
                    }

                    plength = liParent.contentHeight || 0;
                    if(!isNaN(plength)) {
                        if(h == null) {
                            h = Math.max(0, plength - (li.top=t||0) - (li.bottom=b||0));
                        } else if(t == null) {
                            if(b == null)
                                // Center in parent
                                li.top = li.bottom = (plength - h) / 2;
                            else
                                li.top = plength - h - b;
                        } else /*if(b == null)*/ {
                            // When b is also defined, smash it; over-constrained.
                            li.bottom = plength - h - t;
                        }
                        // h,t,b are now not NaN/null
                    }
                }
                // else: all positions are NaN
            }

            if(isSized) {
                sizeMin = this.sizeMin;
                sizeMax = this.sizeMax;

                li.boundedWidth = cgf_boundedNumber(
                        nullOrNegativeOrInfiniteTo(sizeMin.width, 0), // null -> 0
                        w,
                        nullOrNegativeTo(sizeMax.width, posInf)); // null -> Infinity

                li.boundedHeight = cgf_boundedNumber(
                        nullOrNegativeOrInfiniteTo(sizeMin.height, 0), // null -> 0
                        h,
                        nullOrNegativeTo(sizeMax.height, posInf));  // null -> Infinity

                // <=> fixedOrDefault
                li.width  = def.number.as(li.boundedWidth,  NaN);
                li.height = def.number.as(li.boundedHeight, NaN);

                // Note that parents are always sized.
                if(this.isVisualParent) {
                    pad = this.padding; // canvas does not have this

                    li.contentLeft = (pad && pad.left) || 0;
                    li.contentTop  = (pad && pad.top ) || 0;

                    // Subtract padding to width/height.
                    li.boundedContentWidth = cgf_boundedNumber.addFixed(
                        li.boundedWidth,
                        -((pad && pad.width) || 0),
                        toNonNegative);

                    li.boundedContentHeight = cgf_boundedNumber.addFixed(
                        li.boundedHeight,
                        -((pad && pad.height) || 0),
                        toNonNegative);

                    // li.width and li.height may be NaN.
                    li.contentWidth  = def.number.as(li.boundedContentWidth,  NaN);
                    li.contentHeight = def.number.as(li.boundedContentHeight, NaN);
                }
            }

            return li;

            // /**
            //  * @name cgf.visual.Visual.LayoutInfo
            //  * @class The layout information associated with a {@link cgf.visual.Visual.Element} class.
            //  */
            // return /** @lends cgf.visual.Visual.LayoutInfo# **/{
            //     /**
            //      * Gets the laid out position of the element's reference box,
            //      * expressed in its parent's content coordinate system.
            //      *
            //      * The parent's content coordinate system
            //      * has its origin at
            //      * the top-left corner of
            //      * its content box,
            //      * _y_ growing downwards, and
            //      * _x_ growing rightwards.
            //      *
            //      * Note that positions are only set on the layout's _commit_ phase,
            //      * (on all elements but the root, canvas, element)
            //      * and that, before that,
            //      * position coordinates have the default value of `NaN`.
            //      *
            //      * @type {cgf.visual.IPosition}
            //      */
            //     position: {
            //         x: NaN,
            //         y: NaN
            //     },
            //
            //     /**
            //      * Gets the laid out size of the element's reference box,
            //      * expressed in its parent's coordinate system.
            //      *
            //      * The parent's content coordinate system
            //      * has its origin at
            //      * the top-left corner of
            //      * its content box,
            //      * _y_ growing downwards, and
            //      * _x_ growing rightwards.
            //      *
            //      * Note that final sizes are only set on the end of the layout's _prepare_ phase,
            //      * and that, before that,
            //      * size dimensions have the default value of `NaN`.
            //      *
            //      * @type {cgf.visual.ISize}
            //      */
            //     size: {
            //         width:  NaN,
            //         height: NaN
            //     }
            // };
        },

        // Basic, for leaf elements.
        _layoutEnd: function() {
        },

        /** @override */
        invalidate: function() {

            this.base();

            this.invalidateLayout();
        },

        invalidateLayout: function() {
            if(this._layoutInfo) {
                // Keep the previous layout info, if any.
                this._layoutInfoPrev = this._layoutInfo;
                this._layoutInfo = null;

                // Layout is inherently a tree-global process.
                var vp = this.visualParent;
                if(vp) vp.invalidateLayout();
            }
        },

        /**
         * Gets the preferred size of this element,
         * according to its last measurement, if any,
         * or `null` if it hasn't been measured before.
         *
         * Note that the returned preferred size may be currently dirty.
         * To make sure that an up-to-date preferred size,
         * {@link cgf.visual.Visual#layoutMeasure} must be called before.
         *
         * @example
         * <pre>
         * var elem = new Visual().createElement();
         * var prefSize = elem.layoutMeasure().preferredSize();
         * </pre>
         *
         * @return {cgf.visual.SizePart} The element's preferred size.
         */
        get preferredSize() { return this._prefSize; },

        // State
        get _beenMeasured () { return this._prevAvailSize != null; },

        get _isMeasuring( ) { return (this._flags1 & VIS_FLAGS1.measuring) !== 0; },
        set _isMeasuring(v) { def.bit.set(this._flags1, VIS_FLAGS1.measuring, v); },

        get _isArranging( ) { return (this._flags1 & VIS_FLAGS1.arranging) !== 0; },
        set _isArranging(v) { def.bit.set(this._flags1, VIS_FLAGS1.arranging, v); },

        get _isMeasureDirty( ) { return (this._flags1 & VIS_FLAGS1.measureDirty) !== 0; },
        set _isMeasureDirty(v) {
            if(v) this._flags1 |= VIS_FLAGS1.measureDirtyImplied;
            else  this._flags1 &= ~VIS_FLAGS1.measureDirty;
        },

        get _isArrangeDirty( ) { return (this._flags1 & VIS_FLAGS1.arrangeDirty) !== 0; },
        set _isArrangeDirty(v) {
            if(v) this._flags1 |= VIS_FLAGS1.arrangeDirtyImplied;
            else  this._flags1 &= ~VIS_FLAGS1.arrangeDirty;
        },

        get _isRenderDirty()   { return (this._flags1 & VIS_FLAGS1.renderDirty) !== 0; },
        set _isRenderDirty(v)  { def.bit.set(this._flags1, VIS_FLAGS1.renderDirty, v); },

        // TODO: Coordinate space: local? parent? ...

        /**
         * Measures the element's size, given a certain available size,
         * for layout purposes.
         *
         * If the element is not applicable, then its size is zero.
         *
         * The measurement should respect the
         * element's size-related properties into account,
         * as specified by the user,
         * such as:
         * {@link cgf.visual.props.left left},
         * {@link cgf.visual.props.top top},
         * {@link cgf.visual.props.right right},
         * {@link cgf.visual.props.bottom bottom},
         * {@link cgf.visual.props.width width},
         * {@link cgf.visual.props.widthMin widthMin},
         * {@link cgf.visual.props.widthMax widthMax},
         * {@link cgf.visual.props.height height},
         * {@link cgf.visual.props.heightMin heightMin},
         * {@link cgf.visual.props.heightMax heightMax},
         * {@link cgf.visual.props.margin margin},
         * {@link cgf.visual.props.padding padding},
         * etc.
         *
         * @param {cgf.visual.SizePart} [availSize] The available size.
         * When not specified, the previous measurement's available size is used,
         * or, in case this is the first measurement,
         * a size with both dimensions having the value `Infinity`.
         *
         * In general, one or both of the size dimensions may be `Infinity`.
         * This indicates that the element's size along those dimensions is unconstrained —
         * has all the size it may need.
         *
         * This also indicates that it should determine the size it needs
         * to fit all of its content along those dimensions —
         * this is a "size to content" mode of layout.
         *
         * For the dimensions having a non-infinite value,
         * it is the maximum available size that the element can take,
         * along those dimensions,
         * without having to resort to clipping or scrolling of its content.
         *
         * @return {cgf.visual.Visual} This instance.
         * @protected
         */
        _layoutMeasure: function(availSize) {
            // If we're going to store the computed values in the same properties,
            // we need to take care to un-define its value before...

            // Where can the parent's font and width/height,
            // for the purpose of relative measures' absolutization,
            // be read from?

            // Need they be specified as arguments?
            // Can they simply be read from the parent? From where?

            // Main method should check:
            //  * Not Measuring already.
            //  * Is Visible or Occupies Space when hidden?
            //  * IsMeasureDirty || NeverMeasured?
            //  * IsAvailableSizeCloseToPrevious?
            //  * Check not measuring already.
            //
            // * Set Measuring = true
            // Call measure core
            // Update DesiredSize
            // * Set IsMeasureDirty = false
            // * Set NeverMeasured  = false
            // * Set Measuring      = false

            if(!this._isMeasuring) {

                var prevAvailSize = this._prevAvailSize;
                if(prevAvailSize) {
                    // Already measured, at least once.

                    // Is current measurement clean?
                    if(!this._isMeasureDirty) {

                        // If, however, a different available size is being specified,
                        // we must do the measurement anyway.
                        if(availSize) {
                            // Compare if they are "the same".
                            if(areSameSize(prevAvailSize, availSize)) return this;
                        } else {
                            // The default available size is infinite: {width: Infinity, height: Infinity}.
                            // Was the previous size also Infinite?
                            if(isInfiniteSize(prevAvailSize)) return this;
                        }
                    }
                    // else if previous measurement is marked dirty, just do it, whatever the case.
                }

                // Must do the measurement.

                if(!availSize) availSize = prevAvailSize || {width: Infinity, height: Infinity};

                var prefSize;
                if(this.applicable) {
                    this._isMeasuring = true;
                    try {
                        prefSize = this._layoutMeasureCore(availSize);
                    } finally {
                        this._isMeasuring = false;
                    }

                    if(!isValidActualSize(prefSize)) throw def.error.operationInvalid("Invalid measured size.");
                } else {
                    // Does not occupy space...
                    prefSize = {width: 0, height: 0};
                }

                this._prevAvailSize  = availSize;
                this._prefSize       = prefSize;
                this._isMeasureDirty = false;
            }

            return this;
        },

        _layoutMeasureCore: function(availSize) {
            return {width: 0, height: 0};
        }
    });