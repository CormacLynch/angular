/**
* @license
* Copyright Google Inc. All Rights Reserved.
*
* Use of this source code is governed by an MIT-style license that can be
* found in the LICENSE file at https://angular.io/license
*/
import {ProceduralRenderer3, RElement, Renderer3} from '../interfaces/renderer';
import {LView} from '../interfaces/view';

/**
 * --------
 *
 * This file contains the core interfaces for styling in Angular.
 *
 * To learn more about the algorithm see `TStylingContext`.
 *
 * --------
 */

/**
 * A static-level representation of all style or class bindings/values
 * associated with a `TNode`.
 *
 * The `TStylingContext` unites all template styling bindings (i.e.
 * `[class]` and `[style]` bindings) as well as all host-level
 * styling bindings (for components and directives) together into
 * a single manifest. It is used each time there are one or more
 * styling bindings present for an element.
 *
 * The styling context is stored on a `TNode` on and there are
 * two instances of it: one for classes and another for styles.
 *
 * ```typescript
 * tNode.styles = [ ... a context only for styles ... ];
 * tNode.classes = [ ... a context only for classes ... ];
 * ```
 *
 * Due to the fact the the `TStylingContext` is stored on a `TNode`
 * this means that all data within the context is static. Instead of
 * storing actual styling binding values, the lView binding index values
 * are stored within the context. (static nature means it is more compact.)

 *
 * ```typescript
 * // <div [class.active]="c"  // lView binding index = 20
 * //      [style.width]="x"   // lView binding index = 21
 * //      [style.height]="y"> // lView binding index = 22
 * tNode.stylesContext = [
 *   0, // the context config value
 *
 *   0b001, // guard mask for width
 *   2, // total entries for width
 *   'width', // the property name
 *   21, // the binding location for the "x" binding in the lView
 *   null,
 *
 *   0b010, // guard mask for height
 *   2, // total entries for height
 *   'height', // the property name
 *   22, // the binding location for the "y" binding in the lView
 *   null,
 * ];
 *
 * tNode.classesContext = [
 *   0, // the context config value
 *
 *   0b001, // guard mask for active
 *   2, // total entries for active
 *   'active', // the property name
 *   20, // the binding location for the "c" binding in the lView
 *   null,
 * ];
 * ```
 *
 * Entry value present in an entry (called a tuple) within the
 * styling context is as follows:
 *
 * ```typescript
 * context = [
 *   CONFIG, // the styling context config value
 *   //...
 *   guardMask,
 *   totalEntries,
 *   propName,
 *   bindingIndices...,
 *   defaultValue
 * ];
 * ```
 *
 * Below is a breakdown of each value:
 *
 * - **guardMask**:
 *   A numeric value where each bit represents a binding index
 *   location. Each binding index location is assigned based on
 *   a local counter value that increments each time an instruction
 *   is called:
 *
 * ```
 * <div [style.width]="x"   // binding index = 21 (counter index = 0)
 *      [style.height]="y"> // binding index = 22 (counter index = 1)
 * ```
 *
 *   In the example code above, if the `width` value where to change
 *   then the first bit in the local bit mask value would be flipped
 *   (and the second bit for when `height`).
 *
 *   If and when there are more than 32 binding sources in the context
 *   (more than 32 `[style/class]` bindings) then the bit masking will
 *   overflow and we are left with a situation where a `-1` value will
 *   represent the bit mask. Due to the way that JavaScript handles
 *   negative values, when the bit mask is `-1` then all bits within
 *   that value will be automatically flipped (this is a quick and
 *   efficient way to flip all bits on the mask when a special kind
 *   of caching scenario occurs or when there are more than 32 bindings).
 *
 * - **totalEntries**:
 *   Each property present in the contains various binding sources of
 *   where the styling data could come from. This includes template
 *   level bindings, directive/component host bindings as well as the
 *   default value (or static value) all writing to the same property.
 *   This value depicts how many binding source entries exist for the
 *   property.
 *
 *   The reason why the totalEntries value is needed is because the
 *   styling context is dynamic in size and it's not possible
 *   for the flushing or update algorithms to know when and where
 *   a property starts and ends without it.
 *
 * - **propName**:
 *   The CSS property name or class name (e.g `width` or `active`).
 *
 * - **bindingIndices...**:
 *   A series of numeric binding values that reflect where in the
 *   lView to find the style/class values associated with the property.
 *   Each value is in order in terms of priority (templates are first,
 *   then directives and then components). When the context is flushed
 *   and the style/class values are applied to the element (this happens
 *   inside of the `stylingApply` instruction) then the flushing code
 *   will keep checking each binding index against the associated lView
 *   to find the first style/class value that is non-null.
 *
 * - **defaultValue**:
 *   This is the default that will always be applied to the element if
 *   and when all other binding sources return a result that is null.
 *   Usually this value is null but it can also be a static value that
 *   is intercepted when the tNode is first constructured (e.g.
 *   `<div style="width:200px">` has a default value of `200px` for
 *   the `width` property).
 *
 * Each time a new binding is encountered it is registered into the
 * context. The context then is continually updated until the first
 * styling apply call has been called (this is triggered by the
 * `stylingApply()` instruction for the active element).
 *
 * # How Styles/Classes are Rendered
 * Each time a styling instruction (e.g. `[class.name]`, `[style.prop]`,
 * etc...) is executed, the associated `lView` for the view is updated
 * at the current binding location. Also, when this happens, a local
 * counter value is incremented. If the binding value has changed then
 * a local `bitMask` variable is updated with the specific bit based
 * on the counter value.
 *
 * Below is a lightweight example of what happens when a single style
 * property is updated (i.e. `<div [style.prop]="val">`):
 *
 * ```typescript
 * function updateStyleProp(prop: string, value: string) {
 *   const lView = getLView();
 *   const bindingIndex = BINDING_INDEX++;
 *   const indexForStyle = localStylesCounter++;
 *   if (lView[bindingIndex] !== value) {
 *     lView[bindingIndex] = value;
 *     localBitMaskForStyles |= 1 << indexForStyle;
 *   }
 * }
 * ```
 *
 * ## The Apply Algorithm
 * As explained above, each time a binding updates its value, the resulting
 * value is stored in the `lView` array. These styling values have yet to
 * be flushed to the element.
 *
 * Once all the styling instructions have been evaluated, then the styling
 * context(s) are flushed to the element. When this happens, the context will
 * be iterated over (property by property) and each binding source will be
 * examined and the first non-null value will be applied to the element.
 *
 * Let's say that we the following template code:
 *
 * ```html
 * <div [style.width]="w1" dir-that-set-width="w2"></div>
 * ```
 *
 * There are two styling bindings in the code above and they both write
 * to the `width` property. When styling is flushed on the element, the
 * algorithm will try and figure out which one of these values to write
 * to the element.
 *
 * In order to figure out which value to apply, the following
 * binding prioritization is adhered to:
 *
 * 1. First template-level styling bindings are applied (if present).
 *    This includes things like `[style.width]` and `[class.active]`.
 *
 * 2. Second are styling-level host bindings present in directives.
 *    (if there are sub/super directives present then the sub directives
 *    are applied first).
 *
 * 3. Third are styling-level host bindings present in components.
 *    (if there are sub/super components present then the sub directives
 *    are applied first).
 *
 * This means that in the code above the styling binding present in the
 * template is applied first and, only if its falsy, then the directive
 * styling binding for width will be applied.
 *
 * ### What about map-based styling bindings?
 * Map-based styling bindings are activated when there are one or more
 * `[style]` and/or `[class]` bindings present on an element. When this
 * code is activated, the apply algorithm will iterate over each map
 * entry and apply each styling value to the element with the same
 * prioritization rules as above.
 *
 * For the algorithm to apply styling values efficiently, the
 * styling map entries must be applied in sync (property by property)
 * with prop-based bindings. (The map-based algorithm is described
 * more inside of the `render3/stlying_next/map_based_bindings.ts` file.)
 */
export interface TStylingContext extends Array<number|string|number|boolean|null|LStylingMap> {
  /** Configuration data for the context */
  [TStylingContextIndex.ConfigPosition]: TStylingConfigFlags;

  /** Temporary value used to track directive index entries until
     the old styling code is fully removed. The reason why this
     is required is to figure out which directive is last and,
     when encountered, trigger a styling flush to happen */
  [TStylingContextIndex.MaxDirectiveIndexPosition]: number;

  /** The bit guard value for all map-based bindings on an element */
  [TStylingContextIndex.MapBindingsBitGuardPosition]: number;

  /** The total amount of map-based bindings present on an element */
  [TStylingContextIndex.MapBindingsValuesCountPosition]: number;

  /** The prop value for map-based bindings (there actually isn't a
   * value at all, but this is just used in the context to avoid
   * having any special code to update the binding information for
   * map-based entries). */
  [TStylingContextIndex.MapBindingsPropPosition]: string;
}

/**
 * A series of flags used to configure the config value present within a
 * `TStylingContext` value.
 */
export const enum TStylingConfigFlags {
  /**
   * The initial state of the styling context config
   */
  Initial = 0b0,

  /**
   * A flag which marks the context as being locked.
   *
   * The styling context is constructed across an element template
   * function as well as any associated hostBindings functions. When
   * this occurs, the context itself is open to mutation and only once
   * it has been flushed once then it will be locked for good (no extra
   * bindings can be added to it).
   */
  Locked = 0b1,
}

/**
 * An index of position and offset values used to natigate the `TStylingContext`.
 */
export const enum TStylingContextIndex {
  ConfigPosition = 0,
  MaxDirectiveIndexPosition = 1,

  // index/offset values for map-based entries (i.e. `[style]`
  // and `[class] bindings).
  MapBindingsPosition = 2,
  MapBindingsBitGuardPosition = 2,
  MapBindingsValuesCountPosition = 3,
  MapBindingsPropPosition = 4,
  MapBindingsBindingsStartPosition = 5,

  // each tuple entry in the context
  // (mask, count, prop, ...bindings||default-value)
  GuardOffset = 0,
  ValuesCountOffset = 1,
  PropOffset = 2,
  BindingsStartOffset = 3,
}

/**
 * A function used to apply or remove styling from an element for a given property.
 */
export interface ApplyStylingFn {
  (renderer: Renderer3|ProceduralRenderer3|null, element: RElement, prop: string,
   value: string|null, bindingIndex?: number|null): void;
}

/**
 * Runtime data type that is used to store binding data referenced from the `TStylingContext`.
 *
 * Because `LView` is just an array with data, there is no reason to
 * special case `LView` everywhere in the styling algorithm. By allowing
 * this data type to be an array that contains various scalar data types,
 * an instance of `LView` doesn't need to be constructed for tests.
 */
export type LStylingData = LView | (string | number | boolean | null)[];

/**
 * Array-based representation of a key/value array.
 *
 * The format of the array is "property", "value", "property2",
 * "value2", etc...
 *
 * The first value in the array is reserved to store the instance
 * of the key/value array that was used to populate the property/
 * value entries that take place in the remainder of the array.
 */
export interface LStylingMap extends Array<{}|string|number|null> {
  [LStylingMapIndex.RawValuePosition]: {}|string|null;
}

/**
 * An index of position and offset points for any data stored within a `LStylingMap` instance.
 */
export const enum LStylingMapIndex {
  /** The location of the raw key/value map instance used last to populate the array entries */
  RawValuePosition = 0,

  /** Where the values start in the array */
  ValuesStartPosition = 1,

  /** The size of each property/value entry */
  TupleSize = 2,

  /** The offset for the property entry in the tuple */
  PropOffset = 0,

  /** The offset for the value entry in the tuple */
  ValueOffset = 1,
}

/**
 * Used to apply/traverse across all map-based styling entries up to the provided `targetProp`
 * value.
 *
 * When called, each of the map-based `LStylingMap` entries (which are stored in
 * the provided `LStylingData` array) will be iterated over. Depending on the provided
 * `mode` value, each prop/value entry may be applied or skipped over.
 *
 * If `targetProp` value is provided the iteration code will stop once it reaches
 * the property (if found). Otherwise if the target property is not encountered then
 * it will stop once it reaches the next value that appears alphabetically after it.
 *
 * If a `defaultValue` is provided then it will be applied to the element only if the
 * `targetProp` property value is encountered and the value associated with the target
 * property is `null`. The reason why the `defaultValue` is needed is to avoid having the
 * algorithm apply a `null` value and then apply a default value afterwards (this would
 * end up being two style property writes).
 *
 * @returns whether or not the target property was reached and its value was
 *  applied to the element.
 */
export interface SyncStylingMapsFn {
  (context: TStylingContext, renderer: Renderer3|ProceduralRenderer3|null, element: RElement,
   data: LStylingData, applyStylingFn: ApplyStylingFn, mode: StylingMapsSyncMode,
   targetProp?: string|null, defaultValue?: string|null): boolean;
}

/**
 * Used to direct how map-based values are applied/traversed when styling is flushed.
 */
export const enum StylingMapsSyncMode {
  /** Only traverse values (no prop/value styling entries get applied) */
  TraverseValues = 0b000,

  /** Apply every prop/value styling entry to the element */
  ApplyAllValues = 0b001,

  /** Only apply the target prop/value entry */
  ApplyTargetProp = 0b010,

  /** Skip applying the target prop/value entry */
  SkipTargetProp = 0b100,
}
