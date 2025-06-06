import { createTooltipster } from "@util/destroyables.ts";
import type { CharacterPF2e } from "./document.ts";

export class PCSheetTabManager {
    actor: CharacterPF2e;

    link: HTMLElement;

    constructor(actor: CharacterPF2e, link: HTMLAnchorElement) {
        this.actor = actor;
        this.link = link;
        this.initialize();
    }

    async initialize(): Promise<void> {
        const content = await fa.handlebars.renderTemplate("systems/pf2e/templates/actors/character/manage-tabs.hbs");
        createTooltipster(this.link, {
            content,
            contentAsHTML: true,
            delay: 250,
            interactive: true,
            theme: "crb-hover",
            title: game.i18n.localize("PF2E.TabManageTabsLabel"),
            trigger: "custom",
            triggerOpen: { click: true },
            triggerClose: { originClick: true, mouseleave: true },
            functionReady: (_origin, helper) => this.#onReady(helper.tooltip),
            functionAfter: this.#onClose.bind(this),
        });
    }

    /** Set each checkbox to be checked according to its corresponding tab visibility */
    #onReady(tooltip: HTMLElement | null = null): void {
        if (!tooltip) return;
        const tabVisibility: Record<string, boolean> = this.actor.flags.pf2e.sheetTabs;
        const nav = this.link.closest("nav");
        const tabs = nav?.querySelectorAll<HTMLAnchorElement>("a.item[data-tab]") ?? [];
        // Show the hidden tab buttons as present but semi-transparent
        for (const tab of Array.from(tabs)) {
            const tabName = tab.dataset.tab ?? "";
            const selector = `input[data-tab-name="${tabName}"]`;
            const input = tooltip.querySelector<HTMLInputElement>(selector);
            if (input) input.checked = tabVisibility[tabName];
            if (tab.classList.contains("hidden")) {
                tab.classList.remove("hidden");
                tab.classList.add("to-hide");
            }
        }

        const checkboxes = Array.from(tooltip.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
        for (const checkbox of checkboxes) {
            this.#handleOnChange(checkbox, checkboxes);
        }
    }

    /** Save to the actor flag when a checkbox is checked or unchecked */
    #handleOnChange(checkbox: HTMLInputElement, checkboxes: HTMLInputElement[]): void {
        checkbox.addEventListener("change", async () => {
            const nav = this.link.closest("nav");
            const tabName = checkbox?.dataset.tabName ?? "";
            const tab = nav?.querySelector(`a.item[data-tab="${tabName}"]`);

            for (const c of checkboxes) {
                c.readOnly = true;
            }

            if (checkbox.checked) {
                tab?.classList.remove("to-hide");
                await this.actor.update({ [`flags.pf2e.sheetTabs.-=${tabName}`]: null }, { render: false });
            } else {
                tab?.classList.add("to-hide");
                await this.actor.update({ [`flags.pf2e.sheetTabs.${tabName}`]: false }, { render: false });
            }

            for (const c of checkboxes) {
                c.readOnly = false;
            }
        });
    }

    /** Hide all tab buttons selected requested be hidden */
    #onClose(): void {
        const tabs = Array.from(this.link.closest("nav")?.querySelectorAll("a.item[data-tab]") ?? []);
        for (const tab of tabs) {
            if (tab.classList.contains("to-hide")) {
                tab.classList.remove("to-hide");
                tab.classList.add("hidden");
            }
        }
    }
}
