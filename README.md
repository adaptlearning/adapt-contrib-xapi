# adapt-contrib-xapi

**xAPI** is an *extension* intended for use with the [Adapt framework](https://github.com/adaptlearning/adapt_framework) version 3.0 or greater to pass Experience API (xAPI) statements between the Adapt content and a Learning Record Store (LRS), such as [Learning Locker®](https://learninglocker.net/).  It is compatible with both the Adapt Framework and the Adapt Authoring Tool.

From this point on, the README assumes a certain level of familiarity with the xAPI and the philosophy behind it.  If the xAPI specification is new to you, please start with the documentation at [xapi.com](https://xapi.com/overview/) before continuing. 

## Configuration
Some setup is required in order to configure the xAPI extension.  If using a standalone Adapt Framework, refer to  [example.json](https://github.com/adaptlearning/adapt-contrib-xapi/blob/master/example.json) for a JSON snipped which should be added to your course's config.json.  If using the Authoring tool you can configure the following attributes:

|Setting|Default|Help|
|--|--|--|
|Is Enabled|  `false` | Set to `true` to enable the extension
|Specification | `xApi` | This must be set
|Endpoint| | URL to the LRS endpoint 
|User (or Key)| | This can be configured in your LRS, or omit if using ADL Launch mechanism
|Password (or Secret)| | (as above)
|Verb language | `en-US`| Indicates the language of the verbs which will be passed to the LRS
|Auto generate IDs for statements | `false` | It is recommended this is not enabled, so that the LRS will generate unique identifiers
|Track state| `false` | Lets the LRS manage the course state via the State API
|LRS connection failur behaviour | Show errors | Indicates what should happen when the course cannot connect to the LRS

By default the xAPI extension listens for the following *core* events.  Those without an asterisk (*) can be toggled via configuration:

| Object |Event  |
|--|--|
| Adapt | `tracking:complete`* |
| Adapt | `router:page` |
| Adapt | `router:menu` |
| Adapt | `assessments:complete` |
| Adapt | `questionView:recordInteraction` |
| contentobjects |`change:_isComplete` |
| articles | `change:_isComplete` |
| blocks | `change:_isComplete` |
| components | `change:_isComplete` |


## Statements
In response to the course, the statements based on the following ADL verbs are sent:
- launched
- initialized
- attempted
- failed
- passed
- suspended
- terminated

In response to activity on navigating via pages and menus:
- experienced

In response to completion of non-question components, blocks, articles or contentobjects:
- completed

In response to completion of question components, along with details of the interaction the following verb will be sent:
- answered

Note that the xAPI extension works well with the core Assessment extension.  The Assessment is responsible fo defining pass or fail criteria, while the xAPI extension merely reports on it.

## Events
The following events are triggered by the xAPI extension:

| Event | Description | Parameter(s) | 
|--|--|--|
|`xapi:lrs:initialize:error`|Triggered when the plugin fails to initialize| An `error` object|
|`xapi:lrs:initialize:success`|Triggered when the plugin successfully establishes connectivity with the LRS | - |
|`xapi:preSendStatement`|Triggered just prior to sending a single statement to the LRS | The `statement` as an object |
|`xapi:lrs:sendStatement:error` | Triggered on an error with sending a statement to the LRS | The `error` object |
|`xapi:lrs:sendStatement:success` | Triggered when a statement is successfully sent to the LRS | - |
|`xapi:preSendStatements`| Triggered just prior to sending multiple statements ot the LRS | An array of `statement` objects |
|`xapi:lrs:sendState:error`| Triggered when state cannot be saved to the LRS | The `error` object |
|`xapi:lrs:sendState:success`| Triggered when state is successfully saved to the LRS | An object representing `newState` |
|`xapi:stateLoaded`| Triggered when state has been successfully loaded from the LRS | - |

