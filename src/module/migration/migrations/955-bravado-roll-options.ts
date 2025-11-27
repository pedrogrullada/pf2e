import { ItemSourcePF2e } from "@item/base/data/index.ts";
import { recursiveReplaceString } from "@util";
import { MigrationBase } from "../base.ts";

export class Migration955BravadoRollOptions extends MigrationBase {
    static override version = 0.955;

    /** Replace item bravado roll options with action roll options */
    override async updateItem(source: ItemSourcePF2e): Promise<void> {
        const slug = source.system.slug;

        if (!slug) return;

        if (source.type === "action") {
            if (slug === "opportune-riposte") {
                source.system.rules = recursiveReplaceString(source.system.rules, (s) =>
                    s.replace("item:trait:bravado", "self:action:trait:bravado"),
                );
            }
        } else if (source.type === "feat") {
            const featSlugs = [
                "battledancer",
                "braggart",
                "derring-do",
                "disarming-flair",
                "fencer",
                "gymnast",
                "illimitable-finisher",
                "panache",
                "rascal",
                "stylish-combatant",
                "wit",
            ];

            if (featSlugs.includes(slug)) {
                source.system.rules = recursiveReplaceString(source.system.rules, (s) =>
                    s.replace("item:trait:bravado", "self:action:trait:bravado"),
                );
            }
        }
    }
}
