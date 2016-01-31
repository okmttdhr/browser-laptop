/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const React = require('react')
const ImmutableComponent = require('./immutableComponent')
const electron = global.require('electron')
const ipc = electron.ipcRenderer

// Actions
const WindowActions = require('../actions/windowActions')
const loadOpenSearch = require('../lib/openSearch').loadOpenSearch
const contextMenus = require('../contextMenus')

// Components
const NavigationBar = require('./navigationBar')
const Frame = require('./frame')
const TabPages = require('./tabPages')
const TabsToolbar = require('./tabsToolbar')
const UpdateBar = require('./updateBar')
const Button = require('./button')
const SiteInfo = require('./siteInfo')
const ReleaseNotes = require('./releaseNotes')

// Constants
const Config = require('../constants/config')
const AppConfig = require('../constants/appConfig')
const messages = require('../constants/messages')

// State handling
const FrameStateUtil = require('../state/frameStateUtil')

class Main extends ImmutableComponent {
  componentDidMount () {
    ipc.on(messages.STOP_LOAD, () => {
      electron.remote.getCurrentWebContents().send(messages.SHORTCUT_ACTIVE_FRAME_STOP)
    })
    ipc.on(messages.GO_BACK, () => {
      console.log('going back')
      electron.remote.getCurrentWebContents().send(messages.SHORTCUT_ACTIVE_FRAME_BACK)
    })
    ipc.on(messages.GO_FORWARD, () => {
      console.log('going forward')
      electron.remote.getCurrentWebContents().send(messages.SHORTCUT_ACTIVE_FRAME_FORWARD)
    })
    ipc.on(messages.CONTEXT_MENU_OPENED, (e, nodeProps) => {
      contextMenus.onMainContextMenu(nodeProps)
    })
    ipc.on(messages.SHORTCUT_NEW_FRAME, (event, url, options = {}) => {
      WindowActions.newFrame({
        location: url || Config.defaultUrl,
        isPrivate: !!options.isPrivate,
        isPartitioned: !!options.isPartitioned
      })

      // Focus URL bar when adding tab via shortcut
      electron.remote.getCurrentWebContents().send(messages.SHORTCUT_FOCUS_URL)
    })

    ipc.on(messages.SHORTCUT_CLOSE_FRAME, (e, i) => typeof i !== 'undefined'
      ? WindowActions.closeFrame(self.props.windowState.get('frames'), FrameStateUtil.getFrameByKey(self.props.windowState, i))
      : WindowActions.closeFrame(self.props.windowState.get('frames'), FrameStateUtil.getActiveFrame(this.props.windowState)))
    ipc.on(messages.SHORTCUT_UNDO_CLOSED_FRAME, () => WindowActions.undoClosedFrame())

    const self = this
    ipc.on(messages.SHORTCUT_SET_ACTIVE_FRAME_BY_INDEX, (e, i) =>
      WindowActions.setActiveFrame(FrameStateUtil.getFrameByIndex(self.props.windowState, i)))

    ipc.on(messages.SHORTCUT_SET_ACTIVE_FRAME_TO_LAST, () =>
      WindowActions.setActiveFrame(self.props.windowState.getIn(['frames', self.props.windowState.get('frames').size - 1])))

    ipc.on(messages.BLOCKED_RESOURCE, (e, blockType, details) => {
      const filteredFrameProps = this.props.windowState.get('frames').filter(frame => frame.get('location') === details.firstPartyUrl)
      filteredFrameProps.forEach(frameProps =>
        WindowActions.setBlockedBy(frameProps, blockType, details.url))
    })

    ipc.on(messages.SHORTCUT_ACTIVE_FRAME_BACK, this.onBack.bind(this))
    ipc.on(messages.SHORTCUT_ACTIVE_FRAME_FORWARD, this.onForward.bind(this))

    loadOpenSearch().then(searchDetail => WindowActions.setSearchDetail(searchDetail))

    window.addEventListener('mousemove', (e) => {
      self.checkForTitleMode(e.pageY)
    })
  }

  checkForTitleMode (pageY) {
    const height = document.querySelector('#navigator').getBoundingClientRect().bottom
    if (pageY <= height && this.props.windowState.getIn(['ui', 'mouseInTitlebar']) !== true) {
      WindowActions.setMouseInTitlebar(true)
    } else if (pageY === undefined || pageY > height && this.props.windowState.getIn(['ui', 'mouseInTitlebar']) !== false) {
      WindowActions.setMouseInTitlebar(false)
    }
  }

  get activeFrame () {
    return this.frames[this.props.windowState.get('activeFrameKey')]
  }

  onBack () {
    this.activeFrame.goBack()
  }

  onForward () {
    this.activeFrame.goForward()
  }

  onBraveMenu () {
    // TODO
  }

  onHamburgerMenu () {
    let settings = {}
    Object.keys(AppConfig.resourceNames).forEach((name) => {
      let value = AppConfig.resourceNames[name]
      let enabled = this.props.appState.getIn([value, 'enabled'])
      settings[value] = enabled === undefined ? AppConfig[value].enabled : enabled
    })
    // whether the current page is bookmarked. needed to re-initialize the
    // application menu.
    settings.bookmarked = this.navBar.bookmarked
    contextMenus.onHamburgerMenu(settings)
  }

  onMainFocus () {
    // When the main container is in focus, set the URL bar to inactive.
    WindowActions.setUrlBarActive(false)
  }

  onHideSiteInfo () {
    WindowActions.setSiteInfoVisible(false)
  }

  onHideReleaseNotes () {
    WindowActions.setReleaseNotesVisible(false)
  }

  get enableAds () {
    let enabled = this.props.appState.getIn(['adInsertion', 'enabled'])
    if (enabled === undefined) {
      enabled = AppConfig.adInsertion.enabled
    }
    return enabled
  }

  render () {
    const comparatorByKeyAsc = (a, b) => a.get('key') > b.get('key')
      ? 1 : b.get('key') > a.get('key') ? -1 : 0

    // Sort frames by key so that the order of the frames do not change which could
    // cause unexpected reloading when a user moves tabs.
    // All frame operations work off of frame keys and not index though so unsorted frames
    // can be passed everywhere other than the Frame elements.
    const sortedFrames = this.props.windowState.get('frames').sort(comparatorByKeyAsc)

    const activeFrame = FrameStateUtil.getActiveFrame(this.props.windowState)

    this.frames = {}

    return <div id='window'>
      <div className='top'>
        <div className='backforward'>
          <span
            className='back fa fa-angle-left'
            disabled={!activeFrame || !activeFrame.get('canGoBack')}
            onClick={this.onBack.bind(this)} />
          <span
            className='forward fa fa-angle-right'
            disabled={!activeFrame || !activeFrame.get('canGoForward')}
            onClick={this.onForward.bind(this)} />
        </div>
        <NavigationBar
          ref={node => this.navBar = node}
          navbar={activeFrame && activeFrame.get('navbar')}
          frames={this.props.windowState.get('frames')}
          sites={this.props.appState.get('sites')}
          activeFrame={activeFrame}
          mouseInTitlebar={this.props.windowState.getIn(['ui', 'mouseInTitlebar'])}
          searchSuggestions={activeFrame && activeFrame.getIn(['navbar', 'urlbar', 'searchSuggestions'])}
          searchDetail={this.props.windowState.get('searchDetail')}
        />
        { this.props.windowState.getIn(['ui', 'siteInfo', 'isVisible'])
          ? <SiteInfo frameProps={activeFrame}
              siteInfo={this.props.windowState.getIn(['ui', 'siteInfo'])}
              onHide={this.onHideSiteInfo.bind(this)} /> : null
        }
        { this.props.windowState.getIn(['ui', 'releaseNotes', 'isVisible'])
          ? <ReleaseNotes
              metadata={this.props.appState.getIn(['updates', 'metadata'])}
              onHide={this.onHideReleaseNotes.bind(this)} /> : null
        }
        <div className='topLevelEndButtons'>
          <Button iconClass='braveMenu'
            className='navbutton'
            onClick={this.onBraveMenu.bind(this)} />
        </div>
        <TabPages frames={this.props.windowState.get('frames')}
          tabPageIndex={this.props.windowState.getIn(['ui', 'tabs', 'tabPageIndex'])}
        />
        <TabsToolbar
          tabs={this.props.windowState.getIn(['ui', 'tabs'])}
          frames={this.props.windowState.get('frames')}
          sites={this.props.appState.get('sites')}
          key='tab-bar'
          activeFrame={activeFrame}
          onMenu={this.onHamburgerMenu.bind(this)}
        />
        <UpdateBar updates={this.props.appState.get('updates')} />
      </div>
      <div className='mainContainer'
        onFocus={this.onMainFocus.bind(this)}>
        <div className='tabContainer'>
        {
          sortedFrames.map(frame =>
            <Frame
              ref={node => this.frames[frame.get('key')] = node}
              frames={this.props.windowState.get('frames')}
              frame={frame}
              key={frame.get('key')}
              enableAds={this.enableAds}
              isPreview={frame.get('key') === this.props.windowState.get('previewFrameKey')}
              isActive={FrameStateUtil.isFrameKeyActive(this.props.windowState, frame.get('key'))}
            />)
        }
        </div>
      </div>
    </div>
  }
}

module.exports = Main
