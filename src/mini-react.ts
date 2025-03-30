interface ComponentFunction {
	new (props: Record<string, unknown>): Component;
	(props: Record<string, unknown>): VirtualElement | string;
}
type VirtualElementType = ComponentFunction | string;

interface VirtualElementProps {
	children?: VirtualElement[];
	[propsName: string]: unknown;
}

interface VirtualElement {
	type: VirtualElementType;
	props: VirtualElementProps;
}

type FiberNodeDOM = Element | Text | null | undefined;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
interface FiberNode<S = any> extends VirtualElement {
	alternate: FiberNode<S> | null;
	dom?: FiberNodeDOM;
	effectTag?: string;
	child?: FiberNode;
	return?: FiberNode;
	sibling?: FiberNode;
	hooks?: {
		state: S;
		queue: S[];
	}[];
}

let wipRoot: FiberNode | null = null;
let nextUnitOfWork: FiberNode | null = null;
let currentRoot: FiberNode | null = null;
let deletions: FiberNode[] = [];
let wipFiber: FiberNode;
let hookIndex = 0;
// Support React.Fragment syntax.
const Fragment = Symbol.for("react.fragment");

// Enhanced requestIdleCallback
((global: Window) => {
	const id = 1;
	const fps = 1e3 / 60;
	let frameDeadline: number;
	let pendingCallback: IdleRequestCallback;
	const channel = new MessageChannel();
	const timeRemaining = () => frameDeadline - window.performance.now();

	const deadline = {
		didTimeout: false,
		timeRemaining,
	};

	channel.port2.onmessage = () => {
		if (typeof pendingCallback === "function") {
			pendingCallback(deadline);
		}
	};

	global.requestIdleCallback = (callback: IdleRequestCallback) => {
		global.requestAnimationFrame((frameTime) => {
			frameDeadline = frameTime + fps;
			pendingCallback = callback;
			channel.port1.postMessage(null);
		});
		return id;
	};
})(window);

const isDef = <T>(param: T): param is NonNullable<T> =>
	param !== void 0 && param !== null;

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
	Object.prototype.toString.call(val) === "[object Object]" &&
	[Object.prototype, null].includes(Object.getPrototypeOf(val));

// Simple judgement of virtual elements
const isVirtualElement = (e: unknown): e is VirtualElement =>
	typeof e === "object";

// Text elements require special handling
const createTextElement = (text: string): VirtualElement => ({
	type: "TEXT",
	props: {
		nodeValue: text,
	},
});

// create custom javascript data structures
const createElement = (
	type: VirtualElementType,
	props: Record<string, unknown> = {},
	...child: (unknown | VirtualElement)[]
): VirtualElement => {
	const children = child.map((c) =>
		isVirtualElement(c) ? c : createTextElement(String(c)),
	);

	return {
		type,
		props: {
			...props,
			children,
		},
	};
};

// Update DOM properties
// For simplicity, we remove all the previous properties and
// add next properties.
const updateDOM = (DOM, prevProps, nextProps) => {
	const defaultPropKeys = "children";

	for (const [removePropKey, removePropValue] of Object.entries(prevProps)) {
		if (removePropKey.startsWith("on")) {
			DOM.removeEventListener(
				removePropKey.substr(2).toLowerCase(),
				removePropValue,
			);
		} else if (removePropKey !== defaultPropKeys) {
			DOM[removePropKey] = "";
		}
	}

	for (const [addPropKey, addPropValue] of Object.entries(nextProps)) {
		if (addPropKey.startsWith("on")) {
			DOM.addEventListener(addPropKey.substr(2).toLowerCase(), addPropValue);
		} else if (addPropKey !== defaultPropKeys) {
			DOM[addPropKey] = addPropValue;
		}
	}
};

// Create DOM based on node type
const createDOM = (fiberNode) => {
	const { type, props } = fiberNode;
	let DOM: HTMLElement | Text | null = null;

	if (type === "TEXT") {
		DOM = document.createTextNode("");
	} else if (typeof type === "string") {
		DOM = document.createElement(type);
	}

	// Update properties based on props after creation
	if (DOM !== null) {
		updateDOM(DOM, {}, props);
	}

	return DOM;
};

// wipRoot (div, container)
//  |-> Counter (function component)
const render = (element: VirtualElement, container: Element) => {
	console.log("🚀 Starting render with element:", element);
	currentRoot = null;
	wipRoot = {
		type: "div",
		dom: container,
		props: {
			children: [{ ...element }],
		},
		alternate: currentRoot,
	};
	nextUnitOfWork = wipRoot;
	deletions = [];
	console.log("📦 Created wipRoot:", wipRoot);
};

// change the DOM based on the fiber node changes.
// Note that we must complete the comparison of all the fiber nodes before commitRoot.
// The comparison of fiber nodes can be interupted, but the commitRoot cannot be interrupted
const commitRoot = () => {
	console.log("💾 Starting commit phase");
	const findParentFiber = (fiberNode?: FiberNode) => {
		if (fiberNode) {
			let parentFiber = fiberNode.return;
			while (parentFiber && !parentFiber.dom) {
				parentFiber = parentFiber.return;
			}
			return parentFiber;
		}
		return null;
	};

	const commitDeletion = (
		parentDOM: FiberNodeDOM,
		DOM: NonNullable<FiberNodeDOM>,
	) => {
		if (isDef(parentDOM)) {
			parentDOM.removeChild(DOM);
		}
	};

	const commitReplacement = (
		parentDOM: FiberNodeDOM,
		DOM: NonNullable<FiberNodeDOM>,
	) => {
		if (isDef(parentDOM)) {
			parentDOM.appendChild(DOM);
		}
	};

	const commitWork = (fiberNode?: FiberNode) => {
		if (fiberNode) {
			if (fiberNode.dom) {
				const parentFiber = findParentFiber(fiberNode);
				const parentDOM = parentFiber?.dom;

				console.log("🔨 Committing work:", {
					type: fiberNode.type,
					effectTag: fiberNode.effectTag,
				});

				switch (fiberNode.effectTag) {
					case "REPLACEMENT":
						commitReplacement(parentDOM, fiberNode.dom);
						break;
					case "UPDATE":
						updateDOM(
							fiberNode.dom,
							fiberNode.alternate ? fiberNode.alternate.props : {},
							fiberNode.props,
						);
						break;
					default:
						break;
				}
			}

			commitWork(fiberNode.child);
			commitWork(fiberNode.sibling);
		}
	};

	for (const deletion of deletions) {
		if (deletion.dom) {
			const parentFiber = findParentFiber(deletion);
			commitDeletion(parentFiber?.dom, deletion.dom);
		}
	}

	if (wipRoot !== null) {
		commitWork(wipRoot.child);
		currentRoot = wipRoot;
	}

	wipRoot = null;
};

// Reconcile the fiber nodes before and after, compare and record the differences
const reconcileChildren = (
	fiberNode: FiberNode,
	elements: VirtualElement[] = [],
) => {
	console.log("🔄 Reconciling children:", {
		parentType: fiberNode.type,
		alternate: fiberNode.alternate,
		elements: elements,
	});

	let index = 0;
	let oldFiberNode: FiberNode | undefined = void 0;
	let prevSibling: FiberNode | undefined = void 0;
	const virtualElements = elements.flat(Number.POSITIVE_INFINITY);

	if (fiberNode.alternate?.child) {
		oldFiberNode = fiberNode.alternate.child;
	}

	while (
		index < virtualElements.length ||
		typeof oldFiberNode !== "undefined"
	) {
		const virtualElement = virtualElements[index];
		let newFiber: FiberNode | undefined = void 0;

		const isSameType = Boolean(
			oldFiberNode &&
				virtualElement &&
				oldFiberNode.type === virtualElement.type,
		);

		console.log("🔍 Comparing fibers:", {
			oldType: oldFiberNode?.type,
			newType: virtualElement?.type,
			isSameType,
		});

		if (isSameType && oldFiberNode) {
			newFiber = {
				type: oldFiberNode.type,
				dom: oldFiberNode.dom,
				alternate: oldFiberNode,
				props: virtualElement.props,
				return: fiberNode,
				effectTag: "UPDATE",
			};
			console.log("📝 Updating existing fiber");
		}
		if (!isSameType && Boolean(virtualElement)) {
			newFiber = {
				type: virtualElement.type,
				dom: null,
				alternate: null,
				props: virtualElement.props,
				return: fiberNode,
				effectTag: "REPLACEMENT",
			};
			console.log("✨ Creating new fiber");
		}
		if (!isSameType && oldFiberNode) {
			deletions.push(oldFiberNode);
			console.log("🗑️ Marking fiber for deletion");
		}
		if (oldFiberNode) {
			oldFiberNode = oldFiberNode.sibling;
		}

		if (index === 0) {
			fiberNode.child = newFiber;
		} else if (typeof prevSibling !== "undefined") {
			prevSibling.sibling = newFiber;
		}

		prevSibling = newFiber;
		index += 1;
	}
};

// Executes each unit task and returns the next unit task
// Different processing according to the type of fiber node.
const performUnitOfWork = (fiberNode: FiberNode): FiberNode | null => {
	console.log("🔨 Processing unit of work:", {
		type: fiberNode.type,
		props: fiberNode.props,
		effectTag: fiberNode.effectTag,
	});

	const { type } = fiberNode;

	switch (typeof type) {
		case "function": {
			console.log("⚛️ Processing function component:", type.name || "Anonymous");
			wipFiber = fiberNode;
			wipFiber.hooks = [];
			hookIndex = 0;
			let children: ReturnType<ComponentFunction>;

			if (Object.getPrototypeOf(type).REACT_COMPONENT) {
				const C = type;
				const component = new C(fiberNode.props);
				const [state, setState] = useState(component.state);
				component.props = fiberNode.props;
				component.state = state;
				component.setState = setState;
				children = component.render.bind(component)();
			} else {
				children = type(fiberNode.props);
			}
			console.log("📝 Function component returned:", children);
			reconcileChildren(fiberNode, [
				isVirtualElement(children)
					? children
					: createTextElement(String(children)),
			]);
			break;
		}

		case "number":
		case "string":
			console.log("🏗️ Processing DOM element:", type);
			if (!fiberNode.dom) {
				fiberNode.dom = createDOM(fiberNode);
			}
			reconcileChildren(fiberNode, fiberNode.props.children);
			break;
		case "symbol":
			if (type === Fragment) {
				console.log("🎯 Processing Fragment");
				reconcileChildren(fiberNode, fiberNode.props.children);
			}
			break;
		default:
			if (typeof fiberNode.props !== "undefined") {
				reconcileChildren(fiberNode, fiberNode.props.children);
			}
			break;
	}

	if (fiberNode.child) {
		console.log("👶 Returning child fiber");
		return fiberNode.child;
	}

	let nextFiberNode: FiberNode | undefined = fiberNode;

	while (typeof nextFiberNode !== "undefined") {
		if (nextFiberNode.sibling) {
			console.log("👥 Returning sibling fiber");
			return nextFiberNode.sibling;
		}
		nextFiberNode = nextFiberNode.return;
	}
	console.log("🏁 No more fibers to process");
	return null;
};

// User requestIdleCallback to query whether there is currently a unit task
// and determine whether the DOM needs to be updated
const workLoop: IdleRequestCallback = (deadline) => {
	// console.log("⏱️ WorkLoop - Time remaining:", deadline.timeRemaining());
	while (nextUnitOfWork && deadline.timeRemaining() > 1) {
		nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
	}

	if (!nextUnitOfWork && wipRoot) {
		console.log("✅ All work completed, committing changes");
		commitRoot();
	}

	window.requestIdleCallback(workLoop);
};

abstract class Component {
	props: Record<string, unknown>;
	abstract state: unknown;
	abstract setState: (value: unknown) => void;
	abstract render: () => VirtualElement;

	constructor(props: Record<string, unknown>) {
		this.props = props;
	}

	// Identify Component.
	static REACT_COMPONENT = true;
}

// Associate the hook with the fiber node
function useState<S>(initialState: S): [S, (value: S) => void] {
	console.log("🎣 useState called with:", initialState);
	const fiberNode: FiberNode<S> = wipFiber;
	const hook: {
		state: S;
		queue: S[];
	} = fiberNode?.alternate?.hooks
		? fiberNode.alternate.hooks[hookIndex]
		: {
				state: initialState,
				queue: [],
			};

	while (hook.queue.length) {
		let newState = hook.queue.shift();
		if (isPlainObject(hook.state) && isPlainObject(newState)) {
			newState = { ...hook.state, ...newState };
		}
		if (isDef(newState)) {
			hook.state = newState;
			console.log("📊 Updating state to:", newState);
		}
	}

	if (typeof fiberNode.hooks === "undefined") {
		fiberNode.hooks = [];
	}

	fiberNode.hooks.push(hook);
	hookIndex += 1;

	const setState = (value: S) => {
		console.log("🔄 setState called with:", value);
		hook.queue.push(value);
		if (currentRoot) {
			wipRoot = {
				type: currentRoot.type,
				dom: currentRoot.dom,
				props: currentRoot.props,
				alternate: currentRoot,
			};
			nextUnitOfWork = wipRoot;
			deletions = [];
			currentRoot = null;
			console.log("🔄 Triggering re-render");
		}
	};

	return [hook.state, setState];
}

// Start the engine!
void (function main() {
	window.requestIdleCallback(workLoop);
})();

export default {
	createElement,
	render,
	useState,
	Component,
	Fragment,
};
