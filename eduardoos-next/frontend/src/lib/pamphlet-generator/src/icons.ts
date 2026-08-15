/** Vite/Astro resolve these to final URLs when the host bundles the module. */
import checkUrl from "../assets/icons/check_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import arrowUpUrl from "../assets/icons/arrow_upward_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import arrowDownUrl from "../assets/icons/arrow_downward_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import addRowAboveUrl from "../assets/icons/add_row_above_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import addRowBelowUrl from "../assets/icons/add_row_below_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import undoUrl from "../assets/icons/undo_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import deleteUrl from "../assets/icons/delete_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";
import menuUrl from "../assets/icons/menu_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg?url";

export const ICONS = {
    check: checkUrl,
    arrowUp: arrowUpUrl,
    arrowDown: arrowDownUrl,
    addRowAbove: addRowAboveUrl,
    addRowBelow: addRowBelowUrl,
    undo: undoUrl,
    delete: deleteUrl,
} as const;

export const MENU_ICON = menuUrl;
