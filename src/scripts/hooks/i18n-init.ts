import { RuleElement, RuleElements } from "@module/rules/index.ts";
import { HomebrewElements } from "@system/settings/homebrew/menu.ts";
import { WorldClockSettings } from "@system/settings/world-clock.ts";
import * as R from "remeda";

export const I18nInit = {
    listen: (): void => {
        Hooks.once("i18nInit", () => {
            game.pf2e.ConditionManager.initialize();
            new HomebrewElements().onInit();
            WorldClockSettings.localizeSchema();

            // Pre-localize rule elements
            fh.Localization.localizeDataModel(RuleElement);
            for (const RuleClass of Object.values(RuleElements.all)) {
                fh.Localization.localizeDataModel(RuleClass);
                for (const [key, field] of Object.entries(RuleClass.schema.fields)) {
                    if ("choices" in field) {
                        const choices = "choices" in field ? field.choices : null;
                        if (
                            !Array.isArray(choices) ||
                            !choices.every((c) => typeof c === "string" || typeof c === "number")
                        ) {
                            continue;
                        }
                        field.choices = R.mapToObj(choices, (choice) => {
                            const prefix = RuleClass.LOCALIZATION_PREFIXES[1];
                            if (!prefix) return [String(choice), choice];
                            const locPath = RuleClass.LOCALIZATION_PREFIXES.map(
                                (p) => `${p}.FIELDS.${key}.choices.${choice}`,
                            ).find((t) => game.i18n.has(t));
                            return locPath ? [choice, game.i18n.localize(locPath)] : [choice, choice];
                        });
                    }
                }
            }
        });
    },
};
