
/**
 * Initializes a scene.
 * 
 * @name pvc.visual.Scene
 * @class Scenes guide the rendering of protovis marks;
 * they are supplied to {@link pv.Mark} <tt>data</tt> property.
 * <p>
 * A scene may feed several marks and so is not specific to a given mark 
 * (contrast with protovis' instances/scenes).
 * </p>
 * <p>
 * Scenes provide a well defined interface to pvc's 
 * extension point functions.
 * </p>
 * <p>
 * Scenes hold precomputed data, that does not change with interaction,
 * and that is thus not recalculated in every protovis render caused by interaction.
 * </p>
 * <p>
 * Scenes bridge the gap between data and visual roles. 
 * Data can be accessed by one or the other view.
 * </p>
 * 
 * @borrows pv.Dom.Node#visitBefore as #visitBefore
 * @borrows pv.Dom.Node#visitAfter as #visitAfter
 * 
 * @borrows pv.Dom.Node#nodes as #nodes
 * @borrows pv.Dom.Node#firstChild as #firstChild
 * @borrows pv.Dom.Node#lastChild as #lastChild
 * @borrows pv.Dom.Node#previousSibling as #previousSibling
 * @borrows pv.Dom.Node#nextSibling as #nextSibling
 * 
 * 
 * @property {pvc.data.Data}  group The data group that's present in the scene, or <tt>null</tt>, if none.
 * @property {pvc.data.Datum} datum The datum that's present in the scene, or <tt>null</tt>, if none.
 * @property {object} atoms The map of atoms, by dimension name, that's present in the scene, or <tt>null</tt>, if none.
 * <p>
 * When there is a group, these are its atoms, 
 * otherwise, 
 * if there is a datum, 
 * these are its atoms.
 * </p>
 * <p>
 * Do <b>NOT</b> modify this object.
 * </p>
 * 
 * @constructor
 * @param {pvc.visual.Scene} [parent=null] The parent scene.
 * @param {object} [keyArgs] Keyword arguments.
 * @property {pvc.data.Data}  [keyArgs.group=null] The data group that's present in the scene.
 * Specify only one of the arguments <tt>group</tt> or <tt>datum</tt>.
 * @property {pvc.data.Datum} [keyArgs.datum=null] The single datum that's present in the scene.
 * Specify only one of the arguments <tt>group</tt> or <tt>datum</tt>.
 */
def.type('pvc.visual.Scene')
.init(function(parent, keyArgs){
    if(pvc.debug >= 4){
        this.id = def.nextId('scene');
    }
    
    this._renderId   = 0;
    this.renderState = {};
    
    pv.Dom.Node.call(this, /* nodeValue */null);
    
    this.parent = parent || null;
    this.root   = this;
    if(parent){
        // parent -> ((pv.Dom.Node#)this).parentNode
        // this   -> ((pv.Dom.Node#)parent).childNodes
        // ...
        var index = def.get(keyArgs, 'index', null);
        parent.insertAt(this, index);
        this.root = parent.root;
    } else {
        /* root scene */
        this._active = null;
        this._panel = def.get(keyArgs, 'panel') || 
            def.fail.argumentRequired('panel', "Argument is required on root scene.");
    }
    
    /* DATA */
    var datum = def.get(keyArgs, 'datum', null),
        group = def.get(keyArgs, 'group', null),
        atoms = null;
    
    // datum /=> group
    // group => datum
    // or both or none
    
    // TODO: shouldn't group take precedence over datum?
    if(!datum) {
        if(group) {
            datum = group._datums[0] || null; // null on empty datas (just try hiding all series with the legend)
            atoms = group.atoms;
        }
    } else {
        atoms = datum.atoms;
    }
    
    this.datum = datum;
    this.group = group;
    this.atoms = atoms;
    
    /* ACTS */
    this.acts = parent ? Object.create(parent.acts) : {};
})
.add(pv.Dom.Node)

.add(/** @lends pvc.visual.Scene# */{
    /**
     * Obtains an enumerable of the datums present in the scene.
     *
     * @type def.Query
     */
    datums: function(){
        return this.group ?
                    this.group.datums() :
                    (this.datum ? def.query(this.datum) : def.query());
    },

    isRoot: function(){
        return this.root === this;   
    },
    
    panel: function(){
        return this.root._panel;
    },
    
//    chart: function(){
//        return this.root._panel.chart;
//    },
//  
    /**
     * Obtains an enumerable of the child scenes.
     * 
     * @type def.Query
     */
    children: function(){
        if(!this.childNodes) {
            return def.query();
        }
        
        return def.query(this.childNodes);
    },
    
    /* INTERACTION */
    anyInteraction: function(){
        return (!!this.root._active || this.anySelected());
    },

    /* ACTIVITY */
    isActive: false,
    
    setActive: function(isActive){
        if(this.isActive !== (!!isActive)){
            rootScene_setActive.call(this.root, this.isActive ? null : this);
        }
    },
    
    clearActive: function(){
        return rootScene_setActive.call(this.root, null);
    },
    
    anyActive: function(){
        return !!this.root._active;
    },
    
    active: function(){
        return this.root._active;
    },
    
    activeSeries: function(){
        var active = this.active();
        return active && active.acts.series.value;
    },
    
    isActiveSeries: function(){
        if(this.isActive){
            return true;
        }
        
        var activeSeries;
        return (activeSeries = this.activeSeries()) != null &&
               (activeSeries === this.acts.series.value);
    },
    
    /* SELECTION */
    isSelected: function(){
        return this._selectedData().is;
    },
    
    anySelected: function(){
        return this._selectedData().any;
    },
    
    _selectedData: function(){
        return this.renderState._selectedData || 
               (this.renderState._selectedData = this._createSelectedData());
    },
    
    _createSelectedData: function(){
        var any = this.panel().chart.dataEngine.owner.selectedCount() > 0,
            isSelected = any && !!this.datum && this.datum.isSelected;
        
        return {
            any: any,
            is:  isSelected
        };
    }
});

/** 
 * Called on each sign's pvc.visual.Sign#buildInstance 
 * to ensure cached data per-render is cleared.
 * 
 *  @param {number} renderId The current render id.
 */
function scene_renderId(renderId){
    if(this._renderId !== renderId){
        if(pvc.debug >= 4){
            pvc.log({sceneId: this.id, oldRenderId: this._renderId, newRenderId: renderId});
        }
        
        this._renderId   = renderId;
        this.renderState = {};
    }
}

function rootScene_setActive(scene){
    if(this._active !== scene){
        if(this._active){
            scene_setActive.call(this._active, false);
        }
        
        this._active = scene || null;
        
        if(this._active){
            scene_setActive.call(this._active, true);
        }
        return true;
    }
    return false;
}

function scene_setActive(isActive){
    if(this.isActive !== (!!isActive)){
        if(!isActive){
            delete this.isActive;
        } else {
            this.isActive = true;
        }
    }
}