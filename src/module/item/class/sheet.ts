import { ItemSheetOptions } from "@item/base/sheet/sheet.ts";
import type { ClassPF2e } from "@item/class/document.ts";
import { createSheetTags, SheetOptions } from "@module/sheet/helpers.ts";
import * as R from "remeda";
import { ABCSheetData, ABCSheetPF2e } from "../abc/sheet.ts";

export class ClassSheetPF2e extends ABCSheetPF2e<ClassPF2e> {
    override async getData(options?: Partial<ItemSheetOptions>): Promise<ClassSheetData> {
        const sheetData = await super.getData(options);
        const itemData = sheetData.item;

        return {
            ...sheetData,
            proficiencyChoices: R.mapValues(CONFIG.PF2E.proficiencyLevels, (v) => game.i18n.localize(v)),
            selectedKeyAbility: this.getLocalizedAbilities(itemData.system.keyAbility),
            trainedSkills: createSheetTags(CONFIG.PF2E.skills, itemData.system.trainedSkills),
            ancestryFeatLevels: createSheetTags(CONFIG.PF2E.levels, itemData.system.ancestryFeatLevels),
            classFeatLevels: createSheetTags(CONFIG.PF2E.levels, itemData.system.classFeatLevels),
            generalFeatLevels: createSheetTags(CONFIG.PF2E.levels, itemData.system.generalFeatLevels),
            skillFeatLevels: createSheetTags(CONFIG.PF2E.levels, itemData.system.skillFeatLevels),
            skillIncreaseLevels: createSheetTags(CONFIG.PF2E.levels, itemData.system.skillIncreaseLevels),
        };
    }
}

interface ClassSheetData extends ABCSheetData<ClassPF2e> {
    proficiencyChoices: Record<number, string>;
    selectedKeyAbility: Record<string, string>;
    trainedSkills: SheetOptions;
    ancestryFeatLevels: SheetOptions;
    classFeatLevels: SheetOptions;
    generalFeatLevels: SheetOptions;
    skillFeatLevels: SheetOptions;
    skillIncreaseLevels: SheetOptions;
}
