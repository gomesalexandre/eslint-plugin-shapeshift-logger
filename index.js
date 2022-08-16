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
        const method = node.parent.property.name;
        const consoleCallNode = node.parent.parent;

        // Get logger as a module-level variable i.e import
        const isLoggerDefined = getVariableByName(
          sourceCode.scopeManager.globalScope.childScopes[0],
          "logger"
        );

        context.report({
          node: consoleCallNode,
          loc: node.loc,
          message: `No native console.${method} allowed, use moduleLogger.${method} instead`,
          fix: function (fixer) {
            const filePath = context.getFilename()
            const fileName = path.parse(filePath).name
            switch (method) {
              case "error": {
                const args = consoleCallNode.arguments;
                const [argc, argv, ...rest] = args
                const [error, errorText] =
                  // Handle both (errorText, error) / (error) arities
                  args.length === 1 ? [argc] : [argv, argc];
                const parsedError = error.raw ?? error.name
                const parsedErrorText = errorText?.raw ?? errorText?.name ?? null
                const parsedRest = (rest || []).map(restArg => restArg?.raw ?? restArg?.name ?? null).filter(Boolean)
                const parsedArgs = [parsedError, parsedErrorText, ...parsedRest].filter(Boolean).join(',')
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
                    `moduleLogger.error(${parsedArgs})`
                  ), // Raw litteral, or var name
                ];
              }
              case "info": {
                const args = consoleCallNode.arguments;
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
                    `moduleLogger.info(${args
                      .map(
                        (arg) =>
                          makeCookedTemplateLitteral(arg) ?? arg.raw ?? arg.name
                      )
                      .join(",")})`
                  ), // Cooked litteral, raw litteral or var name
                ];
              }
              case "warn": {
                const args = consoleCallNode.arguments;
                const [argc, argv, ...rest] = args
                const [warning, warningText] =
                  // Handle both (errorText, error) / (error) arities
                  args.length === 1 ? [argc] : [argv, argc];
                const parsedWarning = warning.raw ?? warning.name
                const parsedWarningText = warningText?.raw ?? warningText?.name ?? null
                const parsedRest = (rest || []).map(restArg => restArg?.raw ?? restArg?.name ?? null).filter(Boolean)
                const parsedArgs = [parsedWarning, parsedWarningText, ...parsedRest].filter(Boolean).join(',')

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
                    `moduleLogger.warn(${parsedArgs})`
                  ), // Raw litteral, or var name
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
                const method = node.parent.property.name;

                return method !== "consoleFn"; // Exclude moduleLogger itself from being reported
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

