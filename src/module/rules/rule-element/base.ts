import type { ActorPF2e, ActorType } from "@actor";
import type { CheckModifier, DamageDicePF2e, ModifierPF2e } from "@actor/modifiers.ts";
import type { Rolled } from "@client/dice/roll.d.mts";
import type {
    DatabaseCreateOperation,
    DatabaseDeleteOperation,
    DataModelConstructionContext,
    DataModelValidationOptions,
} from "@common/abstract/_types.d.mts";
import type { ModelPropsFromSchema } from "@common/data/fields.d.mts";
import { ItemPF2e, type WeaponPF2e } from "@item";
import { ItemSourcePF2e } from "@item/base/data/index.ts";
import { reduceItemName } from "@item/helpers.ts";
import type { TokenDocumentPF2e } from "@scene/index.ts";
import { CheckCheckContext, CheckRoll } from "@system/check/index.ts";
import { LaxSchemaField, PredicateField, SlugField } from "@system/schema-data-fields.ts";
import { tupleHasValue } from "@util";
import * as R from "remeda";
import { isBracketedValue } from "../helpers.ts";
import { BracketedValue, RuleElementSchema, RuleElementSource, RuleValue } from "./data.ts";

/**
 * Rule Elements allow you to modify actorData and tokenData values when present on items. They can be configured
 * in the item's Rules tab which has to be enabled using the "Advanced Rule Element UI" system setting.
 *
 * @category RuleElement
 */
abstract class RuleElementPF2e<TSchema extends RuleElementSchema = RuleElementSchema> extends foundry.abstract
    .DataModel<ItemPF2e<ActorPF2e>, TSchema> {
    declare protected static _schema: LaxSchemaField<RuleElementSchema> | undefined;

    declare label: string;

    sourceIndex: number | null = null;

    protected suppressWarnings = false;

    /** A list of actor types on which this rule element can operate (all unless overridden) */
    protected static validActorTypes: ActorType[] = [
        "army",
        "character",
        "familiar",
        "hazard",
        "npc",
        "party",
        "vehicle",
    ];

    /**
     * @param source unserialized JSON data from the actual rule input
     * @param item where the rule is persisted on
     */
    constructor(source: RuleElementSource, options: RuleElementOptions) {
        super(source, { parent: options.parent, strict: options.strict ?? true, fallback: false });

        if (this.invalid) {
            this.ignored = true;
            return;
        }

        const item = this.parent;
        // Always suppress warnings if the actor has no ID (and is therefore a temporary clone)
        this.suppressWarnings = options.suppressWarnings ?? !item.actor.id;
        this.sourceIndex = options.sourceIndex ?? null;

        const validActorType = tupleHasValue(this.constructor.validActorTypes, item.actor.type);
        if (!validActorType) {
            const actorType = game.i18n.localize(`TYPES.Actor.${item.actor.type}`);
            this.failValidation(`this rule element type cannot be applied to a ${actorType}`);
            source.ignored = true;
        }

        this.label = this.label
            ? game.i18n.format(this.resolveInjectedProperties(this.label), {
                  actor: item.actor.name,
                  item: item.name,
                  origin: item.isOfType("effect") ? (item.origin?.name ?? null) : null,
              })
            : item.name;

        if (item.isOfType("physical")) {
            this.requiresEquipped ??= true;
            this.requiresInvestment =
                item.isInvested === null ? null : !!(source.requiresInvestment ?? this.requiresEquipped);

            // The DataModel schema defaulted `ignored` to `false`: only change to true if not already true
            if (this.ignored === false) {
                this.ignored =
                    (!!this.requiresEquipped && !item.isEquipped) ||
                    item.system.equipped.carryType === "dropped" ||
                    (!!this.requiresInvestment && !item.isInvested);
            }
        } else {
            this.requiresEquipped = null;
            this.requiresInvestment = null;
        }

        // Spinoff composition rules are always inactive
        if (this.spinoff) this.ignored = true;
    }

    static override defineSchema(): RuleElementSchema {
        const fields = foundry.data.fields;
        return {
            key: new fields.StringField({ required: true, nullable: false, blank: false, initial: undefined }),
            slug: new SlugField({ required: true, nullable: true, label: "PF2E.RuleEditor.General.Slug" }),
            label: new fields.StringField({
                required: false,
                nullable: false,
                blank: false,
                initial: undefined,
                label: "PF2E.RuleEditor.General.Label",
            }),
            priority: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 100 }),
            ignored: new fields.BooleanField({ required: false, nullable: false, initial: false }),
            predicate: new PredicateField(),
            requiresEquipped: new fields.BooleanField({ required: false, nullable: true, initial: undefined }),
            requiresInvestment: new fields.BooleanField({ required: false, nullable: true, initial: undefined }),
            spinoff: new SlugField({ required: false, nullable: false, initial: undefined }),
        };
    }

    /** Use a "lax" schema field that preserves properties not defined in the `DataSchema` */
    static override get schema(): LaxSchemaField<RuleElementSchema> {
        if (this._schema && Object.hasOwn(this, "_schema")) return this._schema;

        const schema = new LaxSchemaField(Object.freeze(this.defineSchema()));
        schema.name = this.name;
        Object.defineProperty(this, "_schema", { value: schema, writable: false });

        return schema;
    }

    get item(): this["parent"] {
        return this.parent;
    }

    get actor(): ActorPF2e {
        return this.parent.actor;
    }

    /** Retrieves the token from the actor, or from the active tokens. */
    get token(): TokenDocumentPF2e | null {
        const actor = this.actor;
        if (actor.token) return actor.token;

        const tokens = actor.getActiveTokens();
        const controlled = tokens.find((token) => token.controlled);
        return controlled?.document ?? tokens.shift()?.document ?? null;
    }

    /** Generate a label without a leading title (such as "Effect:") */
    protected getReducedLabel(label = this.label): string {
        return label === this.parent.name ? reduceItemName(label) : label;
    }

    /** Include parent item's name and UUID in `DataModel` validation error messages */
    override validate(options: DataModelValidationOptions = {}): boolean {
        try {
            return super.validate(options);
        } catch (error) {
            if (error instanceof foundry.data.validation.DataModelValidationError) {
                const message = error.message.replace(
                    /validation errors|Joint Validation Error/,
                    `validation errors on item ${this.item.name} (${this.item.uuid})`,
                );
                console.warn(message);
                return false;
            } else {
                throw error;
            }
        }
    }

    /** Test this rule element's predicate, if present */
    protected test(rollOptions?: string[] | Set<string>): boolean {
        if (this.ignored) return false;
        if (this.predicate.length === 0) return true;

        const optionSet = new Set([
            ...(rollOptions ?? this.actor.getRollOptions()),
            // Always include the item roll options of this rule element's parent item
            ...this.item.getRollOptions("parent"),
        ]);

        return this.resolveInjectedProperties(this.predicate).test(optionSet);
    }

    /** Send a deferred warning to the console indicating that a rule element's validation failed */
    protected failValidation(...message: string[]): void {
        const fullMessage = message.join(" ");
        const { name, uuid } = this.item;
        if (!this.suppressWarnings) {
            const ruleName = game.i18n.localize(`PF2E.RuleElement.${this.key}`);
            console.warn(
                `PF2e System | ${ruleName} rules element on item ${name} (${uuid}) failed to validate: ${fullMessage}`,
            );
            this.validationFailures.joint ??= new foundry.data.validation.DataModelValidationFailure({
                message: fullMessage,
                unresolved: true,
            });
        }
        this.ignored = true;
    }

    /**
     * Callback used to parse and look up values when calculating rules. Parses strings that look like
     * {actor|x.y.z}, {item|x.y.z} or {rule|x.y.z} where x.y.z is the path on the current actor, item or rule.
     * It's useful if you want to include something like the item's ID in a modifier selector (for applying the
     * modifier only to a specific weapon, for example), or include the item's name in some text.
     *
     * Example:
     * {
     *   "key": "PF2E.RuleElement.Note",
     *   "selector": "will",
     *   "text": "<b>{item|name}</b> A success on a Will save vs fear is treated as a critical success.",
     *   "predicate": {
     *       "all": ["fear"]
     *   }
     * }
     *
     * @param source The string that is to be resolved
     * @param options.warn Whether to warn on a failed resolution
     * @return the looked up value on the specific object
     */
    resolveInjectedProperties<T extends string | number | object | null | undefined>(
        source: T,
        options?: { injectables?: Record<string, unknown>; warn?: boolean },
    ): T;
    resolveInjectedProperties(
        source: string | number | object | null | undefined,
        options: { injectables?: Record<string, unknown>; warn?: boolean } = {},
    ): string | number | object | null | undefined {
        const { injectables = {}, warn = true } = options;
        if (source === null || typeof source === "number" || (typeof source === "string" && !source.includes("{"))) {
            return source;
        }

        // Walk the object tree and resolve any string values found
        if (Array.isArray(source)) {
            for (let i = 0; i < source.length; i++) {
                source[i] = this.resolveInjectedProperties(source[i], options);
            }
        } else if (R.isPlainObject(source)) {
            for (const [key, value] of Object.entries(source)) {
                if (typeof value === "string" || R.isObjectType(value)) {
                    source[key] = this.resolveInjectedProperties(value, options);
                }
            }

            return source;
        } else if (typeof source === "string") {
            const injectableKeys = [
                "actor",
                "item",
                "rule",
                ...Object.keys(injectables).filter((i) => /^[a-z][a-z]+$/g.test(i)),
            ];
            const pattern = new RegExp(String.raw`{(${injectableKeys.join("|")})\|(.*?)}`, "g");
            const allInjectables: Record<string, object> = {
                actor: this.actor,
                item: this.item,
                rule: this,
                ...injectables,
            };
            return source.replace(pattern, (_match, key: string, prop: string) => {
                const data = allInjectables[key];
                const value = (() => {
                    // In case of formerly deprecated paths upstream now throws on
                    try {
                        return fu.getProperty(data, prop);
                    } catch {
                        return undefined;
                    }
                })();
                if (value === undefined) {
                    this.ignored = true;
                    if (warn) this.failValidation(`Failed to resolve injected property "${prop}" in "${source}"`);
                }
                return String(value);
            });
        }

        return source;
    }

    /**
     * Parses the value attribute on a rule.
     *
     * @param valueData can be one of 3 different formats:
     * * {value: 5}: returns 5
     * * {value: "4 + @details.level.value"}: uses foundry's built in roll syntax to evaluate it
     * * {
     *      field: "item|data.level.value",
     *      brackets: [
     *          {start: 1, end: 4, value: 5}],
     *          {start: 5, end: 9, value: 10}],
     *   }: compares the value from field to >= start and <= end of a bracket and uses that value
     * @param defaultValue if no value is found, use that one
     * @return the evaluated value
     */
    resolveValue(
        value: unknown,
        defaultValue: Exclude<RuleValue, BracketedValue> | null = 0,
        { evaluate = true, resolvables = {}, warn = true }: ResolveValueParams = {},
    ): number | string | boolean | object | null {
        value ??= defaultValue ?? null;
        if (typeof value === "number" || typeof value === "boolean" || value === null) {
            return value;
        }
        value = this.resolveInjectedProperties(value, { warn });

        if (Array.isArray(value)) return value;

        const resolvedFromBracket = this.isBracketedValue(value)
            ? this.#resolveBracketedValue(value, defaultValue)
            : value;
        if (typeof resolvedFromBracket === "number") return resolvedFromBracket;

        if (R.isPlainObject(resolvedFromBracket)) {
            return R.isPlainObject(defaultValue)
                ? fu.mergeObject(defaultValue, resolvedFromBracket, { inplace: false })
                : resolvedFromBracket;
        }

        if (typeof resolvedFromBracket === "string") {
            const saferEval = (formula: string): number => {
                try {
                    // If any resolvables were not provided for this formula, return the default value
                    const unresolveds = formula.match(/@[a-z0-9.]+/gi) ?? [];
                    // Allow failure of "@target" and "@actor.conditions" with no warning
                    if (unresolveds.length > 0) {
                        const shouldWarn =
                            warn &&
                            !unresolveds.every((u) => u.startsWith("@target.") || u.startsWith("@actor.conditions."));
                        this.ignored = true;
                        if (shouldWarn) {
                            this.failValidation(`unable to resolve formula, "${formula}"`);
                        }
                        return Number(defaultValue);
                    }
                    return Roll.safeEval(formula);
                } catch {
                    this.failValidation(`unable to evaluate formula, "${formula}"`);
                    return 0;
                }
            };

            // Include worn armor as resolvable for PCs since there is guaranteed to be no more than one
            if (this.actor.isOfType("character")) {
                resolvables.armor = this.actor.wornArmor;
            }

            const trimmed = resolvedFromBracket.trim();
            return (trimmed.includes("@") || /^-?\d+$/.test(trimmed)) && evaluate
                ? saferEval(
                      Roll.replaceFormulaData(trimmed, {
                          ...this.actor.getRollData(),
                          item: this.item,
                          ...resolvables,
                      }),
                  )
                : trimmed;
        }

        return defaultValue;
    }

    protected isBracketedValue(value: unknown): value is BracketedValue {
        return isBracketedValue(value);
    }

    #resolveBracketedValue(
        value: BracketedValue,
        defaultValue: Exclude<RuleValue, BracketedValue> | null,
    ): Exclude<RuleValue, BracketedValue> | null {
        const bracketNumber = ((): number => {
            if (!value.field) return this.actor.level;
            const field = String(value.field);
            const separator = field.indexOf("|");
            const source = field.substring(0, separator);
            const { actor, item } = this;

            switch (source) {
                case "actor":
                    return Number(fu.getProperty(actor, field.substring(separator + 1))) || 0;
                case "item":
                    return Number(fu.getProperty(item, field.substring(separator + 1))) || 0;
                case "rule":
                    return Number(fu.getProperty(this, field.substring(separator + 1))) || 0;
                default:
                    return Number(fu.getProperty(actor, field.substring(0))) || 0;
            }
        })();
        const brackets = value.brackets ?? [];
        // Set the fallthrough (the value set when no bracket matches) to be of the same type as the default value
        const bracketFallthrough = (() => {
            switch (typeof defaultValue) {
                case "number":
                case "boolean":
                case "object":
                    return defaultValue;
                case "string":
                    return Number.isNaN(Number(defaultValue)) ? defaultValue : Number(defaultValue);
                default:
                    return null;
            }
        })();
        return (
            brackets.find((bracket) => {
                const start = bracket.start ?? 0;
                const end = bracket.end ?? Infinity;
                return start <= bracketNumber && end >= bracketNumber;
            })?.value ?? bracketFallthrough
        );
    }
}

interface RuleElementPF2e<TSchema extends RuleElementSchema>
    extends foundry.abstract.DataModel<ItemPF2e<ActorPF2e>, TSchema>,
        ModelPropsFromSchema<RuleElementSchema> {
    constructor: typeof RuleElementPF2e<TSchema>;

    get schema(): LaxSchemaField<TSchema>;

    /**
     * Run between Actor#applyActiveEffects and Actor#prepareDerivedData. Generally limited to ActiveEffect-Like
     * elements
     */
    onApplyActiveEffects?(): void;

    /**
     * Run in Actor#prepareDerivedData which is similar to an init method and is the very first thing that is run after
     * an actor.update() was called. Use this hook if you want to save or modify values on the actual data objects
     * after actor changes. Those values should not be saved back to the actor unless we mess up.
     *
     * This callback is run for each rule in random order and is run very often, so watch out for performance.
     */
    beforePrepareData?(): void;

    /** Run after all actor preparation callbacks have been run so you should see all final values here. */
    afterPrepareData?(): void;

    /**
     * Run just prior to a check roll, passing along roll options already accumulated
     * @param domains Applicable predication domains for pending check
     * @param rollOptions Currently accumulated roll options for the pending check
     */
    beforeRoll?(domains: string[], rollOptions: Set<string>): void;

    /**
     * Run following a check roll, passing along roll options already accumulated
     * @param domains Applicable selectors for the pending check
     * @param domains Applicable predication domains for pending check
     * @param rollOptions Currently accumulated roll options for the pending check
     */
    afterRoll?(params: RuleElementPF2e.AfterRollParams): Promise<void>;

    /** Runs before the rule's parent item's owning actor is updated */
    preUpdateActor?(): Promise<{ create: ItemSourcePF2e[]; delete: string[] }>;

    /**
     * Runs before this rules element's parent item is created. The item is temporarilly constructed. A rule element can
     * alter itself before its parent item is stored on an actor; it can also alter the item source itself in the same
     * manner.
     */
    preCreate?({ ruleSource, itemSource, pendingItems, operation }: RuleElementPF2e.PreCreateParams): Promise<void>;

    /**
     * Runs before this rules element's parent item is created. The item is temporarilly constructed. A rule element can
     * alter itself before its parent item is stored on an actor; it can also alter the item source itself in the same
     * manner.
     */
    preDelete?({ pendingItems, operation }: RuleElementPF2e.PreDeleteParams): Promise<void>;

    /**
     * Runs before this rules element's parent item is updated */
    preUpdate?(changes: DeepPartial<ItemSourcePF2e>): Promise<void>;

    /**
     * Runs after an item holding this rule is added to an actor. If you modify or add the rule after the item
     * is already present on the actor, nothing will happen. Rules that add toggles won't work here since this method is
     * only called on item add.
     *
     * @param actorUpdates The first time a rule is run it receives an empty object. After all rules set various values
     * on the object, this object is then passed to actor.update(). This is useful if you want to set specific values on
     * the actor when an item is added. Keep in mind that the object for actor.update() is flattened, e.g.
     * {'data.attributes.hp.value': 5}.
     */
    onCreate?(actorUpdates: Record<string, unknown>): void;

    /**
     * Run at certain encounter events, such as the start of the actor's turn. Similar to onCreate and onDelete, this provides an opportunity to make
     * updates to the actor.
     * @param data.event        The type of event that triggered this callback
     * @param data.actorUpdates A record containing update data for the actor
     */
    onUpdateEncounter?(data: {
        event: "initiative-roll" | "turn-start";
        actorUpdates: Record<string, unknown>;
    }): Promise<void>;

    /**
     * Runs after an item holding this rule is removed from an actor. This method is used for cleaning up any values
     * on the actorData or token objects (e.g., removing temp HP).
     *
     * @param actorData data of the actor that holds the item
     * @param item the removed item data
     * @param actorUpdates see onCreate
     * @param tokens see onCreate
     */
    onDelete?(actorUpdates: Record<string, unknown>): void;

    /** An optional method for excluding damage modifiers and extra dice */
    applyDamageExclusion?(weapon: WeaponPF2e, modifiers: (DamageDicePF2e | ModifierPF2e)[]): void;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace RuleElementPF2e {
    export interface PreCreateParams<T extends RuleElementSource = RuleElementSource> {
        /** The source partial of the rule element's parent item to be created */
        itemSource: ItemSourcePF2e;
        /** The source of the rule in `itemSource`'s `system.rules` array */
        ruleSource: T;
        /** All items pending creation in a `ItemPF2e.createDocuments` call */
        pendingItems: ItemSourcePF2e[];
        /** Items temporarily constructed from pending item source */
        tempItems: ItemPF2e<ActorPF2e>[];
        /** Updates that should be performed to items after pre creates conclude */
        itemUpdates: EmbeddedDocumentUpdateData[];
        /** The `operation` object from the `ItemPF2e.createDocuments` call */
        operation: Partial<DatabaseCreateOperation<ActorPF2e | null>>;
        /** Whether this preCreate run is from a pre-update reevaluation */
        reevaluation?: boolean;
    }

    export interface PreDeleteParams {
        /** All items pending deletion in a `ItemPF2e.deleteDocuments` call */
        pendingItems: ItemPF2e<ActorPF2e>[];
        /** The context object from the `ItemPF2e.deleteDocuments` call */
        operation: Partial<DatabaseDeleteOperation<ActorPF2e | null>>;
    }

    export interface AfterRollParams {
        roll: Rolled<CheckRoll>;
        check: CheckModifier;
        context: CheckCheckContext;
        domains: string[];
        rollOptions: Set<string>;
    }
}

interface ResolveValueParams {
    evaluate?: boolean;
    resolvables?: Record<string, unknown>;
    warn?: boolean;
}

interface RuleElementOptions extends DataModelConstructionContext<ItemPF2e<ActorPF2e>> {
    /** If created from an item, the index in the source data */
    sourceIndex?: number;
    /** If data validation fails for any reason, do not emit console warnings */
    suppressWarnings?: boolean;
}

export { RuleElementPF2e, type RuleElementOptions };
