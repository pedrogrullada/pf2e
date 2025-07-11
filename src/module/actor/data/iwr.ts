import { ImmunityType, IWRType, ResistanceType, WeaknessType } from "@actor/types.ts";
import { CONDITION_SLUGS } from "@item/condition/values.ts";
import { MAGIC_TRADITIONS } from "@item/spell/values.ts";
import { IWRException } from "@module/rules/rule-element/iwr/base.ts";
import { Predicate, PredicateStatement } from "@system/predication.ts";
import { isObject, objectHasKey, setHasElement } from "@util";

abstract class IWR<TType extends IWRType> {
    readonly type: TType;

    declare value?: number;

    readonly exceptions: IWRException<TType>[];

    declare readonly doubleVs?: IWRException<TType>[];

    /** A definition for a custom IWR */
    readonly definition: Predicate | null;

    source: string | null;

    /** A label for a custom IWR */
    readonly #customLabel: string | null;

    protected abstract readonly typeLabels: Record<TType, string>;

    static get disjuncter(): Intl.ListFormat {
        return (this.#disjunctor ??= new Intl.ListFormat(game.i18n.lang, { style: "long", type: "disjunction" }));
    }

    static #disjunctor: Intl.ListFormat | null = null;

    constructor(data: IWRConstructorData<TType>) {
        this.type = data.type;
        this.exceptions = fu.deepClone(data.exceptions ?? []);
        this.definition = data.definition ?? null;
        this.source = data.source ?? null;
        this.#customLabel = this.type === "custom" ? (data.customLabel ?? null) : null;
    }

    get label(): string {
        return this.#createLabel({ withValue: this.value !== undefined });
    }

    /** A label showing the type, exceptions, and doubleVs but no value (in case of weaknesses and resistances) */
    get applicationLabel(): string {
        return this.#createLabel({ withValue: false });
    }

    /** Create a possibly complex IWR label with exceptions and types for which the value doubles. */
    #createLabel({ withValue }: { withValue: boolean }): string {
        const type = this.typeLabel;
        const exceptions = IWR.disjuncter.format(
            this.exceptions.map((e) => game.i18n.localize(typeof e === "string" ? this.typeLabels[e] : e.label)),
        );
        const doubleVs = IWR.disjuncter.format(
            this.doubleVs?.map((e) => game.i18n.localize(typeof e === "string" ? this.typeLabels[e] : e.label)) ?? [],
        );
        const key =
            this.exceptions.length > 0
                ? this.doubleVs?.length
                    ? "ExceptionsDoubleVs"
                    : "Exceptions"
                : this.doubleVs?.length
                  ? "DoubleVs"
                  : "Simple";
        const value = withValue ? (this.value ?? "") : "";

        return game.i18n
            .format(`PF2E.Damage.IWR.CompositeLabel.${key}`, {
                type,
                value,
                exceptions,
                doubleVs,
            })
            .replace(/\s+/g, " ")
            .trim();
    }

    /** A label consisting of just the type */
    get typeLabel(): string {
        return game.i18n.localize(this.#customLabel ?? this.typeLabels[this.type]);
    }

    protected describe(iwrType: IWRException<TType>): PredicateStatement[] {
        if (isObject(iwrType)) return iwrType.definition;

        switch (iwrType) {
            case "air":
            case "alchemical":
            case "earth":
            case "metal":
            case "olfactory":
            case "radiation":
            case "visual":
            case "water":
            case "wood":
                return [`item:trait:${iwrType}`];
            case "all-damage":
                return ["damage"];
            case "arcane":
            case "divine":
            case "occult":
            case "primal":
                return [{ or: [`item:trait:${iwrType}`, `origin:action:trait:${iwrType}`] }];
            case "area-damage":
                return ["area-damage"];
            case "arrow-vulnerability":
                return ["item:group:bow"];
            case "auditory":
                return ["item:trait:auditory"];
            case "axes":
            case "axe-vulnerability":
                return ["item:group:axe"];
            case "critical-hits":
                return ["check:outcome:critical-success"];
            case "custom":
                return this.definition ?? [];
            case "disease":
                return ["item:trait:disease"];
            case "emotion":
                return ["item:type:effect", "item:trait:emotion"];
            case "energy":
            case "physical":
                return [`damage:category:${iwrType}`];
            case "fear-effects":
                return ["item:type:effect", "item:trait:fear"];
            case "ghost-touch":
                return [
                    {
                        or: [
                            "item:rune:property:astral",
                            "item:rune:property:ghost-touch",
                            "item:rune:property:greater-astral",
                        ],
                    },
                ];
            case "holy":
                return [{ or: ["origin:action:trait:holy", "item:trait:holy"] }];
            case "magic":
                return [{ or: ["origin:action:trait:impulse", "item:from-spell", "item:type:spell"] }];
            case "magical":
                return [
                    {
                        or: [
                            "item:magical",
                            "origin:action:trait:magical",
                            ...MAGIC_TRADITIONS.map((t) => `origin:action:trait:${t}`),
                        ],
                    },
                ];
            case "mental":
                return [{ or: ["damage:type:mental", { and: ["item:type:effect", "item:trait:mental"] }] }];
            case "non-magical":
                return [{ not: "item:magical" }];
            case "object-immunities":
                return [
                    {
                        or: [
                            "damage:type:bleed",
                            "damage:type:mental",
                            "damage:type:poison",
                            "damage:type:spirit",
                            {
                                and: [
                                    "item:type:condition",
                                    {
                                        or: [
                                            "item:slug:doomed",
                                            "item:slug:drained",
                                            "item:slug:fatigued",
                                            "item:slug:paralyzed",
                                            "item:slug:sickened",
                                            "item:slug:unconscious",
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ];
            case "persistent-damage":
                return [
                    {
                        or: [
                            "damage:category:persistent",
                            { and: ["item:type:condition", "item:slug:persistent-damage"] },
                        ],
                    },
                ];
            case "precision":
            case "splash-damage": {
                const component = iwrType === "splash-damage" ? "splash" : "precision";
                return [`damage:component:${component}`];
            }
            case "spells":
            case "damage-from-spells":
                return ["damage", { or: ["item:type:spell", "item:from-spell", "item:trait:impulse"] }];
            case "unarmed-attacks":
                return ["item:category:unarmed"];
            case "unholy":
                return [{ or: ["origin:action:trait:unholy", "item:trait:unholy"] }];
            default: {
                if (iwrType in CONFIG.PF2E.damageTypes) {
                    return [`damage:type:${iwrType}`];
                }

                if (setHasElement(CONDITION_SLUGS, iwrType)) {
                    return ["item:type:condition", `item:slug:${iwrType}`];
                }

                if (objectHasKey(CONFIG.PF2E.materialDamageEffects, iwrType)) {
                    switch (iwrType) {
                        case "adamantine":
                            return this instanceof Resistance
                                ? [{ or: ["damage:material:adamantine", "damage:material:keep-stone"] }]
                                : ["damage:material:adamantine"];
                        case "cold-iron":
                            return this instanceof Weakness
                                ? [{ or: ["damage:material:cold-iron", "damage:material:sovereign-steel"] }]
                                : ["damage:material:cold-iron"];
                        case "duskwood":
                            return [
                                {
                                    or: [
                                        "damage:material:duskwood",
                                        { and: ["self:mode:undead", "damage:material:peachwood"] },
                                    ],
                                },
                            ];
                        case "silver":
                            return this instanceof Weakness
                                ? [{ or: ["damage:material:silver", "damage:material:dawnsilver"] }]
                                : ["damage:material:silver"];
                        default:
                            return [`damage:material:${iwrType}`];
                    }
                }

                return [`unhandled:${iwrType}`];
            }
        }
    }

    get predicate(): Predicate {
        const typeStatements = this.describe(this.type);
        const exceptions = this.exceptions.flatMap((exception): PredicateStatement | PredicateStatement[] => {
            const described = this.describe(exception).filter((s) => s !== "damage");
            return described.length === 1 ? described : { and: described };
        });

        const statements = [
            typeStatements,
            exceptions.length === 0 ? [] : exceptions.length === 1 ? { not: exceptions[0] } : { nor: exceptions },
        ].flat();

        return new Predicate(statements);
    }

    toObject(): Readonly<IWRDisplayData<TType>> {
        return {
            type: this.type,
            exceptions: fu.deepClone(this.exceptions),
            source: this.source,
            label: this.label,
        };
    }

    test(statements: string[] | Set<string>): boolean {
        return this.predicate.test(statements);
    }
}

type IWRConstructorData<TType extends IWRType> = {
    type: TType;
    exceptions?: IWRException<TType>[];
    customLabel?: Maybe<string>;
    definition?: Maybe<Predicate>;
    source?: string | null;
};

type IWRDisplayData<TType extends IWRType> = Pick<IWR<TType>, "type" | "exceptions" | "source" | "label">;

class Immunity extends IWR<ImmunityType> implements ImmunitySource {
    protected readonly typeLabels = CONFIG.PF2E.immunityTypes;

    declare value?: never;

    declare readonly doubleVs?: never;
}

interface IWRSource<TType extends IWRType = IWRType> {
    type: TType;
    exceptions?: IWRException<TType>[];
}

type ImmunitySource = IWRSource<ImmunityType>;

class Weakness extends IWR<WeaknessType> implements WeaknessSource {
    protected readonly typeLabels = CONFIG.PF2E.weaknessTypes;

    declare readonly doubleVs?: never;

    override value: number;

    constructor(data: IWRConstructorData<WeaknessType> & { value: number }) {
        super(data);
        this.value = data.value;
    }

    override toObject(): Readonly<WeaknessDisplayData> {
        return {
            ...super.toObject(),
            value: this.value,
        };
    }
}

type WeaknessDisplayData = IWRDisplayData<WeaknessType> & Pick<Weakness, "value">;

interface WeaknessSource extends IWRSource<WeaknessType> {
    value: number;
}

class Resistance extends IWR<ResistanceType> implements ResistanceSource {
    protected readonly typeLabels = CONFIG.PF2E.resistanceTypes;

    override value: number;

    override readonly doubleVs: IWRException<ResistanceType>[];

    constructor(
        data: IWRConstructorData<ResistanceType> & { value: number; doubleVs?: IWRException<ResistanceType>[] },
    ) {
        super(data);
        this.value = data.value;
        this.doubleVs = fu.deepClone(data.doubleVs ?? []);
    }

    override toObject(): ResistanceDisplayData {
        return {
            ...super.toObject(),
            value: this.value,
            doubleVs: fu.deepClone(this.doubleVs),
        };
    }

    /** Get the doubled value of this resistance if present and applicable to a given instance of damage */
    getDoubledValue(damageDescription: Set<string>): number {
        if (this.doubleVs.length === 0) return this.value;
        const predicate =
            this.doubleVs.length === 1
                ? new Predicate(this.describe(this.doubleVs[0]))
                : new Predicate({
                      or: this.doubleVs.map((doubleVs) => {
                          const description = this.describe(doubleVs);
                          return description.length === 1 ? description[0] : { and: description };
                      }),
                  });
        return predicate.test(damageDescription) ? this.value * 2 : this.value;
    }
}

type ResistanceDisplayData = IWRDisplayData<ResistanceType> & Pick<Resistance, "value" | "doubleVs">;

interface ResistanceSource extends IWRSource<ResistanceType> {
    value: number;
    doubleVs?: IWRException<ResistanceType>[];
}

/** Weaknesses to things that "[don't] normally deal damage, such as water": applied separately as untyped damage */
const NON_DAMAGE_WEAKNESSES: Set<WeaknessType> = new Set([
    ...MAGIC_TRADITIONS,
    "air",
    "earth",
    "ghost-touch",
    "holy",
    "metal",
    "plant",
    "radiation",
    "salt-water",
    "salt",
    "spells",
    "unholy",
    "water",
    "wood",
]);

export { Immunity, NON_DAMAGE_WEAKNESSES, Resistance, Weakness };
export type { ImmunitySource, IWRSource, ResistanceSource, WeaknessSource };
