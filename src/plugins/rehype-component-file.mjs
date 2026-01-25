/// <reference types="mdast" />
import { h } from "hastscript";

/**
 * Creates a File Download component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.url - The URL of the file.
 * @param {string} [properties.title] - The title of the file.
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created File component.
 */
export function FileComponent(properties, children) {
    let url = properties.url;
    let title = properties.title;

    // Try to find a link in children if url is not provided
    if (!url && Array.isArray(children) && children.length > 0) {
        // Helper to find 'a' tag in children (handling paragraph wrapper)
        const findLink = (nodes) => {
            for (const node of nodes) {
                if (node.tagName === 'a') return node;
                if (node.children) {
                    const found = findLink(node.children);
                    if (found) return found;
                }
            }
            return null;
        };
        const linkNode = findLink(children);
        if (linkNode) {
            url = linkNode.properties.href;
            // Use link text as title if not provided
            if (!title && linkNode.children && linkNode.children.length > 0) {
                 // Simple extraction of text
                 const extractText = (nodes) => {
                     return nodes.map(c => {
                         if (c.type === 'text') return c.value;
                         if (c.children) return extractText(c.children);
                         return '';
                     }).join('');
                 };
                 title = extractText(linkNode.children);
            }
        }
    }

	if (!url) {
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("file" directive must be leaf type "::file{url=\'...\'}" or container type ":::file ... [Link](...) ... :::")',
		]);
	}

    title = title || "Download File";
    const filename = url.split('/').pop() || url;

	return h(
		"a",
		{
			href: url,
            target: "_blank",
			class:
				"exclude-text-prose relative flex w-full h-20 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--primary)] transition-colors overflow-hidden items-center gap-4 px-4 no-underline group my-4 shadow-sm hover:shadow-md",
            style: "text-decoration: none; color: inherit;"
		},
		[
			h(
				"div",
				{
					class:
						"flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--btn-plain-bg-hover)] text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-white transition-colors shrink-0",
				},
				[
					h(
						"svg",
						{
							xmlns: "http://www.w3.org/2000/svg",
							height: "1.5rem",
							viewBox: "0 0 512 512",
							fill: "currentColor",
						},
						[
							h("path", {
								d: "M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zM432 456a24 24 0 1 0 0-48 24 24 0 1 0 0 48z",
							}),
						],
					),
				],
			),
			h("div", { class: "flex flex-col justify-center overflow-hidden min-w-0" }, [
				h(
					"div",
					{ class: "text-lg font-bold text-[var(--heading-text)] truncate" },
					title,
				),
				h(
					"div",
					{
						class: "text-sm text-[var(--content-secondary)] truncate opacity-70 font-mono",
					},
					filename,
				),
			]),
		],
	);
}
