import type { ActorPF2e } from "@actor";
import type { EffectPF2e } from "@item";
import type { EncounterPF2e } from "@module/encounter/index.ts";

export class EffectTracker {
    effects: EffectPF2e<ActorPF2e>[] = [];

    /** A separate collection of aura effects, including ones with unlimited duration */
    auraEffects: Collection<string, EffectPF2e<ActorPF2e>> = new Collection();

    #insert(effect: EffectPF2e<ActorPF2e>, duration: { expired: boolean; remaining: number }): void {
        if (this.effects.length === 0) {
            this.effects.push(effect);
        } else {
            for (let index = 0; index < this.effects.length; index++) {
                const other = this.effects[index];
                const remaining = other.remainingDuration.remaining;
                // compare duration and insert if other effect has later expiration
                if (duration.remaining > remaining) {
                    // new effect has longer remaining duration - skip ahead
                } else if (remaining > duration.remaining) {
                    this.effects.splice(index, 0, effect);
                    return;
                } else if ((effect.system.start.initiative ?? 0) > (other.system.start.initiative ?? 0)) {
                    // new effect has later initiative - skip ahead
                } else if ((other.system.start.initiative ?? 0) > (effect.system.start.initiative ?? 0)) {
                    this.effects.splice(index, 0, effect);
                    return;
                } else if (
                    other.system.duration.expiry === "turn-start" &&
                    effect.system.duration.expiry === "turn-end"
                ) {
                    this.effects.splice(index, 0, effect);
                    return;
                }
            }
            this.effects.push(effect);
        }
    }

    register(effect: EffectPF2e<ActorPF2e>): void {
        if (effect.fromAura && (canvas.ready || !effect.actor.isToken) && effect.id) {
            this.auraEffects.set(effect.uuid, effect);
        }

        const index = this.effects.findIndex((e) => e.id === effect.id);
        const systemData = effect.system;
        const duration = systemData.duration.unit;
        switch (duration) {
            case "unlimited":
            case "encounter": {
                if (duration === "unlimited") systemData.expired = false;
                if (index >= 0 && index < this.effects.length) {
                    this.effects.splice(index, 1);
                }
                return;
            }
            default: {
                const duration = effect.remainingDuration;
                effect.system.expired = duration.expired;
                if (this.effects.length === 0 || index < 0) {
                    this.#insert(effect, duration);
                } else {
                    const existing = this.effects[index];
                    // compare duration and update if different
                    if (duration.remaining !== existing.remainingDuration.remaining) {
                        this.effects.splice(index, 1);
                        this.#insert(effect, duration);
                    }
                }
            }
        }
    }

    unregister(toRemove: EffectPF2e<ActorPF2e>): void {
        this.effects = this.effects.filter((e) => e !== toRemove);
        this.auraEffects.delete(toRemove.uuid);
    }

    /**
     * Check for expired effects, removing or disabling as appropriate according to world settings
     * @param [options.resetItemData] Perform individual item data resets. This is only needed when the world time
     *                                changes.
     */
    async refresh(options: { resetItemData?: boolean } = {}): Promise<void> {
        if (options.resetItemData) {
            const actors = new Set(this.effects.flatMap((e) => e.actor ?? []));
            for (const actor of actors) {
                actor.reset();
            }
            game.pf2e.effectPanel.refresh();
        }

        const actorsToUpdate = new Set(this.effects.filter((e) => e.isExpired).map((e) => e.actor));

        if (game.pf2e.settings.automation.removeEffects) {
            for (const actor of actorsToUpdate) {
                await this.#removeExpired(actor);
            }
        }
    }

    async #removeExpired(actor: ActorPF2e): Promise<void> {
        if (actor.primaryUpdater === game.user) {
            await actor.deleteEmbeddedDocuments(
                "Item",
                actor.itemTypes.effect.filter((e) => e.isExpired).map((e) => e.id),
            );
        }
    }

    /** Expire or remove on-encounter-end effects */
    async onEncounterEnd(encounter: EncounterPF2e): Promise<void> {
        const autoRemoveExpired = game.pf2e.settings.automation.removeEffects;
        if (!autoRemoveExpired) return;

        const actors = encounter.combatants.contents
            .flatMap((c) => c.actor ?? [])
            .filter((a) => game.user === a.primaryUpdater);

        for (const actor of actors) {
            const expiresNow = actor.itemTypes.effect.filter((e) => e.system.duration.unit === "encounter");
            if (expiresNow.length === 0) continue;
            const deletes = expiresNow.map((e) => e.id);
            await actor.deleteEmbeddedDocuments("Item", deletes);
            for (const effect of expiresNow) {
                this.unregister(effect);
            }
        }
    }
}
