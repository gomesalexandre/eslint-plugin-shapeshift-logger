const { getVariableByName } = require("./utils");
const path = require("path");

/**
 * Checks whether the given reference is a member access which is not
 * allowed by options or not.
 * @param {eslint-scope.Reference} reference The reference to check.
 * @returns {boolean} `true` if the reference is a member access which
 *      is not allowed by options.
 */
function isMemberAccess(reference) {
  const node = reference.identifier;
  const parent = node.parent;

  return parent.type === "MemberExpression" && parent.object === node;
}

const rules = {
  "no-native-console": {
    meta: {
      fixable: "code",
      type: "problem",
    },
    create: function (context) {
      function report(reference) {
        const sourceCode = context.getSourceCode();
        const node = reference.identifier;
        const consoleMethod = node.parent.property.name;
        const consoleCallNode = node.parent.parent;

        // Get logger as a module-level variable i.e import - if already defined, we shouldn't re-import it
        const isLoggerDefined = getVariableByName(
          sourceCode.scopeManager.globalScope.childScopes[0],
          "logger"
        );

        context.report({
          node: consoleCallNode,
          loc: node.loc,
          message: `No native console.${consoleMethod} allowed, use moduleLogger.${consoleMethod} instead`,
          fix: function (fixer) {
            const filePath = context.getFilename();
            const fileName = path.parse(filePath).name;
            switch (consoleMethod) {
              case "error":
              case "warn": {
                const argv = consoleCallNode.arguments;
                const [firstArg, secondArg, ...restArgs] = argv;
                const [errorOrWarning, errorTextOrWarningText] =
                  // Handle both (errorTextOrWarningText, errorOrWarning) / (errorOrWarning) arities
                  argv.length === 1 ? [firstArg] : [secondArg, firstArg];
                const parsedErrorOrWarning = errorOrWarning.raw ?? errorOrWarning.name;
                const parsedErrorTextOrWarningText =
                  errorTextOrWarningText?.raw ?? errorTextOrWarningText?.name ?? null;
                const parsedrestArgs = (restArgs || [])
                  .map(
                    (restArgsArg) =>
                      restArgsArg?.raw ?? restArgsArg?.name ?? null
                  )
                  .filter(Boolean);
                const parsedargv = [
                  parsedErrorOrWarning,
                  parsedErrorTextOrWarningText,
                  ...parsedrestArgs,
                ]
                  .filter(Boolean)
                  .join(",");
                return [
                  ...(isLoggerDefined
                    ? []
                    : [
                        // Insert moduleLogger import and moduleLogger at first source line, both will be auto-sorted
                        fixer.insertTextBefore(
                          sourceCode.ast,
                          `
                  import { logger } from 'lib/logger';
                  const moduleLogger = logger.child({ namespace: ['${fileName}'] })
                  `
                        ),
                      ]),
                  fixer.replaceText(
                    consoleCallNode,
                    `moduleLogger.${consoleMethod}(${parsedargv})`
                  ), // Raw litteral, or var name
                ];
              }
              case "info": {
                const argv = consoleCallNode.arguments;
                const makeCookedTemplateLitteral = (arg) =>
                  arg.quasis?.[0]?.value?.cooked
                    ? `\`${arg.quasis?.[0]?.value?.cooked}\``
                    : null;
                return [
                  ...(isLoggerDefined
                    ? []
                    : [
                        // Insert moduleLogger import and moduleLogger at first source line, both will be auto-sorted
                        fixer.insertTextBefore(
                          sourceCode.ast,
                          `
                  import { logger } from 'lib/logger';
                  const moduleLogger = logger.child({ namespace: ['${fileName}'] })
                  `
                        ),
                      ]),
                  fixer.replaceText(
                    consoleCallNode,
                    `moduleLogger.info(${argv
                      .map(
                        (arg) =>
                          makeCookedTemplateLitteral(arg) ?? arg.raw ?? arg.name
                      )
                      .join(",")})`
                  ), // Cooked litteral, raw litteral or var name
                ];
              }
              default:
                return;
            }
          },
        });
      }

      return {
        Program() {
          const scope = context.getScope();
          const consoleVar = getVariableByName(scope, "console");
          const shadowed = consoleVar && consoleVar.defs.length > 0;

          /*
           * 'scope.through' includes all references to undefined
           * variables. If the variable 'console' is not defined, it uses
           * 'scope.through'.
           */
          const references = consoleVar
            ? consoleVar.references
            : scope.through.filter(isConsole);

          if (!shadowed) {
            references
              .filter(isMemberAccess)
              .filter((reference) => {
                const node = reference.identifier;
                const consoleMethod = node.parent.property.name;

                return consoleMethod !== "consoleFn"; // Exclude moduleLogger itself from being reported
              })
              .forEach(report);
          }
        },
      };
    },
  },
};

module.exports = {
  rules,
};
